#!/usr/bin/env bash
#
# Піднімає весь стенд однією командою:
#
#   ./start-demo.sh
#
# Postgres + Kafka у контейнерах, міграції, довідник магазинів, заглушка ECOM,
# сервіс layer і сторінка-візуалізатор. Ctrl+C зупиняє все, що запустив скрипт.
#
# Контейнери навмисно лишаються працювати після виходу, щоб база не втрачалася.
# Зупинити їх: pnpm infra:down
#
# Прапорці:
#   --no-open     не відкривати браузер
#   --no-install  не ставити залежності (швидший повторний запуск)
#   --fresh       стерти демо-дані (товари й події), довідник лишити

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VISUALIZER_DIR="$BACKEND_DIR/visualizer"
LOG_DIR="$BACKEND_DIR/.demo-logs"

LAYER_PORT=3000
ECOM_PORT=4000
WEB_PORT=5173

OPEN_BROWSER=1
INSTALL_DEPS=1
FRESH=0

for arg in "$@"; do
  case "$arg" in
    --no-open) OPEN_BROWSER=0 ;;
    --no-install) INSTALL_DEPS=0 ;;
    --fresh) FRESH=1 ;;
    -h | --help)
      # The comment block under the shebang is the help text; stop at the first
      # line that is not a comment so the code below never leaks into it.
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' \
        "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Невідомий прапорець: $arg (спробуйте --help)" >&2
      exit 2
      ;;
  esac
done

# ── вивід ─────────────────────────────────────────────────────────────────────

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  BOLD=$'\033[1m' DIM=$'\033[2m' RED=$'\033[31m' GREEN=$'\033[32m'
  YELLOW=$'\033[33m' RESET=$'\033[0m'
else
  BOLD='' DIM='' RED='' GREEN='' YELLOW='' RESET=''
fi

step() { printf '%s▸ %s%s\n' "$BOLD" "$1" "$RESET"; }
info() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
fail() {
  printf '\n%s✗ %s%s\n' "$RED" "$1" "$RESET" >&2
  exit 1
}

# ── зупинка ───────────────────────────────────────────────────────────────────

declare -a STARTED_PIDS=()
declare -a STARTED_NAMES=()

cleanup() {
  local status=$?
  trap - EXIT INT TERM

  if ((${#STARTED_PIDS[@]} > 0)); then
    printf '\n%s▸ Зупиняю сервіси%s\n' "$BOLD" "$RESET"
    local index
    for index in "${!STARTED_PIDS[@]}"; do
      local pid="${STARTED_PIDS[index]}"
      # Кожен сервіс стартує в окремій сесії, тому гасимо групу цілком —
      # інакше pnpm піде, а node під ним лишиться.
      if kill -0 "$pid" 2>/dev/null; then
        kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
        info "${STARTED_NAMES[index]} зупинено"
      fi
    done
    wait 2>/dev/null || true
  fi

  if ((status == 0)); then
    printf '\n%sКонтейнери працюють далі. Зупинити: pnpm infra:down%s\n' "$DIM" "$RESET"
  fi

  exit "$status"
}
trap cleanup EXIT INT TERM

# ── допоміжне ─────────────────────────────────────────────────────────────────

port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3<&- && return 0
  return 1
}

wait_for_http() {
  local url="$1" name="$2" attempts="${3:-90}" logfile="${4:-}"

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if curl -sf -o /dev/null "$url"; then
      ok "$name готовий"
      return 0
    fi
    sleep 1
  done

  if [[ -n "$logfile" && -f "$logfile" ]]; then
    printf '\n%s--- останні рядки %s ---%s\n' "$DIM" "$logfile" "$RESET" >&2
    tail -20 "$logfile" >&2
  fi
  fail "$name не піднявся за ${attempts}с"
}

wait_for_tcp() {
  local port="$1" name="$2" attempts="${3:-90}"

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if port_busy "$port"; then
      ok "$name готовий"
      return 0
    fi
    sleep 1
  done

  fail "$name не відповідає на порті $port за ${attempts}с"
}

# Запускає сервіс у власній сесії, щоб потім прибити його разом з дітьми.
start_service() {
  local name="$1" dir="$2" logfile="$3"
  shift 3

  setsid bash -c "cd '$dir' && exec \"\$@\"" _ "$@" >"$logfile" 2>&1 &
  STARTED_PIDS+=("$!")
  STARTED_NAMES+=("$name")
  info "$name → $logfile"
}

ensure_env_var() {
  local key="$1" value="$2"

  if ! grep -qE "^${key}=" "$BACKEND_DIR/.env"; then
    printf '%s=%s\n' "$key" "$value" >>"$BACKEND_DIR/.env"
    warn "у .env додано $key"
  fi
}

# ── 0. що потрібно ────────────────────────────────────────────────────────────

step 'Перевіряю оточення'

command -v node >/dev/null || fail 'Не знайшов node. Потрібен Node 22+.'
command -v pnpm >/dev/null || fail 'Не знайшов pnpm. Встановити: npm i -g pnpm'
command -v curl >/dev/null || fail 'Не знайшов curl.'

[[ -d "$VISUALIZER_DIR" ]] || fail "Не знайшов папку visualizer (шукав $VISUALIZER_DIR)"

# docker-compose тут може говорити і з Docker, і з Podman.
COMPOSE=()
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  COMPOSE=(docker compose)
  ok 'контейнери: docker'
else
  PODMAN_SOCKET="/run/user/$(id -u)/podman/podman.sock"
  if [[ -S "$PODMAN_SOCKET" ]]; then
    export DOCKER_HOST="unix://$PODMAN_SOCKET"
    ok 'контейнери: podman'
  elif command -v podman >/dev/null; then
    fail "Podman є, але сокет не активний. Запустіть: systemctl --user start podman.socket"
  fi

  if command -v docker-compose >/dev/null; then
    COMPOSE=(docker-compose)
  elif command -v podman-compose >/dev/null; then
    COMPOSE=(podman-compose)
  else
    fail 'Не знайшов ні docker compose, ні docker-compose, ні podman-compose.'
  fi
fi

for port in "$LAYER_PORT" "$ECOM_PORT" "$WEB_PORT"; do
  if port_busy "$port"; then
    fail "Порт $port уже зайнятий. Зупиніть той процес і спробуйте знову."
  fi
done
ok "порти $LAYER_PORT, $ECOM_PORT, $WEB_PORT вільні"

mkdir -p "$LOG_DIR"

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  ok 'створив .env з .env.example'
fi
ensure_env_var ECOM_API_URL "http://localhost:$ECOM_PORT"
ensure_env_var CORS_ORIGINS "http://localhost:$WEB_PORT"

# ── 1. залежності ─────────────────────────────────────────────────────────────

if ((INSTALL_DEPS)); then
  step 'Встановлюю залежності'
  (cd "$BACKEND_DIR" && pnpm install --silent) || fail 'pnpm install у layer-backend не вдався'
  ok 'layer-backend'
  (cd "$VISUALIZER_DIR" && pnpm install --silent) || fail 'pnpm install у visualizer не вдався'
  ok 'visualizer'
fi

# ── 2. Postgres і Kafka ───────────────────────────────────────────────────────

step 'Піднімаю Postgres і Kafka'
(cd "$BACKEND_DIR" && "${COMPOSE[@]}" up -d) >"$LOG_DIR/compose.log" 2>&1 ||
  { tail -20 "$LOG_DIR/compose.log" >&2; fail 'compose up не вдався'; }

info 'чекаю на базу'
for ((attempt = 1; attempt <= 90; attempt++)); do
  if (cd "$BACKEND_DIR" &&
    "${COMPOSE[@]}" exec -T postgres pg_isready -q -U "${POSTGRES_USER:-layer}") 2>/dev/null; then
    ok 'Postgres готовий'
    break
  fi
  ((attempt == 90)) && fail 'Postgres не піднявся за 90с'
  sleep 1
done

wait_for_tcp 9092 'Kafka'

# ── 3. схема і довідник ───────────────────────────────────────────────────────

step 'Готую базу'
(cd "$BACKEND_DIR" && pnpm exec prisma generate) >"$LOG_DIR/prisma.log" 2>&1 ||
  { tail -20 "$LOG_DIR/prisma.log" >&2; fail 'prisma generate не вдався'; }
ok 'клієнт Prisma згенеровано'

# deploy, а не dev: застосовує наявні міграції й нічого не питає.
(cd "$BACKEND_DIR" && pnpm exec prisma migrate deploy) >>"$LOG_DIR/prisma.log" 2>&1 ||
  { tail -20 "$LOG_DIR/prisma.log" >&2; fail 'prisma migrate deploy не вдався'; }
ok 'міграції застосовано'

(cd "$BACKEND_DIR" && pnpm db:seed) >>"$LOG_DIR/prisma.log" 2>&1 ||
  { tail -20 "$LOG_DIR/prisma.log" >&2; fail 'seed не вдався'; }
ok 'регіони й магазини на місці'

if ((FRESH)); then
  (cd "$BACKEND_DIR" && "${COMPOSE[@]}" exec -T postgres psql -q -U "${POSTGRES_USER:-layer}" \
    -d "${POSTGRES_DB:-layer}" -c \
    'DELETE FROM "Product"; DELETE FROM "EcomStockOutbox"; DELETE FROM "BcEvent";') \
    >>"$LOG_DIR/prisma.log" 2>&1 || warn 'не вдалося стерти демо-дані'
  ok 'демо-дані стерто'
fi

# ── 4. сервіси ────────────────────────────────────────────────────────────────

step 'Запускаю сервіси'
start_service 'заглушка ECOM' "$BACKEND_DIR" "$LOG_DIR/ecom.log" pnpm mock:ecom
wait_for_http "http://localhost:$ECOM_PORT/_state" 'заглушка ECOM' 30 "$LOG_DIR/ecom.log"

start_service 'сервіс layer' "$BACKEND_DIR" "$LOG_DIR/layer.log" pnpm start
wait_for_http "http://localhost:$LAYER_PORT/health" 'сервіс layer' 120 "$LOG_DIR/layer.log"

start_service 'візуалізатор' "$VISUALIZER_DIR" "$LOG_DIR/visualizer.log" pnpm dev
wait_for_http "http://localhost:$WEB_PORT/" 'візуалізатор' 60 "$LOG_DIR/visualizer.log"

# ── 5. готово ─────────────────────────────────────────────────────────────────

printf '\n%s  Стенд готовий%s\n\n' "$BOLD$GREEN" "$RESET"
printf '  %sСторінка для менеджера%s   %shttp://localhost:%s%s\n' \
  "$BOLD" "$RESET" "$GREEN" "$WEB_PORT" "$RESET"
printf '  %sAPI сервісу (Swagger)%s    http://localhost:%s/docs\n' \
  "$DIM" "$RESET" "$LAYER_PORT"
printf '  %sЗаглушка ECOM%s            http://localhost:%s/_state\n' \
  "$DIM" "$RESET" "$ECOM_PORT"
printf '\n  %sЛоги: %s%s\n' "$DIM" "$LOG_DIR" "$RESET"
printf '  %sCtrl+C — зупинити%s\n\n' "$DIM" "$RESET"

if ((OPEN_BROWSER)) && command -v xdg-open >/dev/null; then
  xdg-open "http://localhost:$WEB_PORT" >/dev/null 2>&1 || true
fi

# Тримаємо скрипт живим, поки живі сервіси: перший, що впаде, зупинить решту.
wait -n
warn 'Один із сервісів завершився — зупиняю решту. Дивіться логи вище.'
