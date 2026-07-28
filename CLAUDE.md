# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

Read `docs/` before starting a task. `docs/modules/<name>.md` covers one module each;
`docs/superpower/*.md` covers the cross-cutting decisions — the stock formula and what
is still open about it, the e-com reservations integration and how it degrades, event
ingestion and transaction boundaries, publication, and the local stand. Keep them
updated as part of the change, not afterwards.

## What this service is

The **layer** service translates Business Central stock events into the stock e-com may sell.
BC publishes onto Kafka; layer keeps the per-shop picture in Postgres, derives a per-region
e-com quantity, and publishes that back onto Kafka. Read `README.md` for the flow diagram and
the four pipeline stages.

Stack: NestJS 11 (Express) + Prisma 7 (Postgres, driver adapter) + kafkajs + nestjs-pino +
Swagger. Package manager is **pnpm**; build-script approvals live in `pnpm-workspace.yaml`
under `allowBuilds`.

UI-facing strings and reference data are Ukrainian (shop names, region names, the `Новий`
order status maps to `OrderStatus.NEW`).

## Commands

```bash
./start-demo.sh                    # whole stand in one command (pnpm demo)
pnpm install                       # runs prisma generate via postinstall
pnpm infra:up                      # Postgres + Kafka via docker-compose
pnpm db:migrate                    # prisma migrate dev
pnpm db:seed                       # regions/shops (reference data BC does not send yet)
pnpm start:dev                     # watch mode
pnpm build && pnpm start:prod
pnpm lint                          # eslint --fix
pnpm test                          # unit tests
pnpm test -- stock.calculate       # a single suite by name
pnpm test:e2e                      # tests in test/
pnpm mock:ecom                     # stub e-com reservations API on :4000
```

A calculation calls e-com, so `pnpm mock:ecom` has to be running for anything to be
published locally. Its `PUT /_state` switches between `ok`, `down`, `slow` and
`garbage` to exercise the no-fresh-reservations path.

The `visualizer/` folder renders this whole flow on one page for
non-technical readers. It is read-only apart from the endpoints it calls, and it reads
`/pipeline/*` — a module that exists purely to explain the pipeline, which is why its
repository queries several modules' tables directly.

There is **no Docker daemon** on the dev machine — `docker-compose` (v5 binary) drives
Podman. Export the socket before any compose or `pnpm infra:*` command:

```bash
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock
```

## Architecture

Two top-level trees, and the split is load-bearing:

- **`src/modules/`** — business logic. One folder per domain, plus `app.module.ts` (the root
  module lives here, not in `src/`).
- **`src/shared/`** — integrations and third-party clients, exposed by the `@Global`
  `SharedModule`: `AppConfigService`, `DatabaseService`, `KafkaProducerService`,
  `KafkaAdminService`. Feature modules inject them without importing anything.

Inside a module:

| File | Role |
| --- | --- |
| `<name>.module.ts` | wiring |
| `<name>.controller.ts` | HTTP or Kafka entry point — unwraps the request, calls the facade, nothing else |
| `<name>.service.ts` | **facade**: delegates to the operation services |
| `services/<name>.<verb>.service.ts` | one file per operation (`apply-delta`, `recalculate`, `read`, `calculate`, …) |
| `repositories/<entity>.repository.ts` | thin Prisma access, **no business logic** |
| `dto/`, `response/`, `types/`, `constants/`, `specs/` | as needed |

Rules that matter:

- **Controllers call the facade only.** Sub-services hold the logic.
- **No barrel files and no path aliases** — deep relative imports (`../../shared/...`).
  `tsconfig.json` sets `baseUrl` only.
- Repositories extend `BaseRepository` and take an optional `tx?: TransactionClient` as the
  last argument, resolving the client via `this.client(tx)`. Callers decide transaction
  boundaries; repositories never open one.
- Log messages are prefixed with the class name: `` `[${MyService.name}]...` ``. Services
  inject `PinoLogger` from nestjs-pino as the first constructor parameter.

### Module dependency direction

`bc-events → stock → ecom`. Nothing points back. `ecom` owns both the calculated result
(`EcomStock`) and the outbox, so `stock` can hand it a result without a cycle. The BC DTOs
are mapped to domain commands (`ProductCatalogueCommand` / `StockUpdateCommand`) in
`bc-events.service.ts`, which is why the stock module never sees a Kafka payload shape.

### BC's message shapes are not settled

Two messages arrive: **product** (master data, no quantities) and **stock** (quantities per
variant per warehouse). The stock one is still moving — warehouses may be nested per variant
or named once for the message, and the number may be absolute or a delta. All four
combinations are normalised in `toStockCommand` in `bc-events.service.ts`, and that mapping
function is the only place that should ever need to change when BC decides.

Two rules hold there: a line with neither `quantity` nor `quantityDelta` is **rejected**, never
treated as zero (it would silently empty a real warehouse), and `price` on a stock message is
accepted but never read by stock logic — nobody has explained why BC sends it.

### Configuration vs tuning

`.env` is deployment configuration only (addresses, credentials, switches), declared in
`environment.config.ts` and read through `AppConfigService`. Timeouts, retry counts, batch
sizes and the default safety buffer are **constants** in each module's `constants` folder —
do not move them into the environment.

### Applying an event and calculating from it are separate steps

The reservations term of the formula lives in e-com, so a calculation makes an HTTP call.
Therefore:

- The transaction covers **applying** the BC event plus enqueuing a `StockRecalculationTask`,
  and nothing else. Never put the e-com call inside a transaction — it would hold a Postgres
  connection for as long as e-com takes to answer.
- The calculation runs after that transaction commits (`StockService.tryRecalculate`), and a
  failure there only delays publication because the task guarantees a retry.
- This is also why applying is atomic: replaying a *delta* is not idempotent, whereas the
  derived calculation can always be recomputed.

## Things that will bite you

- **The stock formula is still partly a mock.**
  `src/modules/stock/services/stock.calculate.service.ts` implements the manager's description
  literally (`shopsTotal - safetyBuffer - reserved`, clamped at zero) and documents what is
  unresolved. Inputs are gathered in `stock.recalculate.service.ts`.
- **An unreachable e-com must never be read as `reserved = 0`.** That overstates stock and
  invites overselling. `EcomApiService` therefore never returns a fallback — it throws
  `EcomApiUnavailableError`, and the caller carries the last known value over, flags
  `reservationsStale`, and records a retry task.
- **`EcomStock.publishedQuantity` is not the same as `quantity`.** `quantity` is the last
  computed value; `publishedQuantity` is what e-com actually holds. A stale result is only
  published if it does not exceed `publishedQuantity`, so folding the two together silently
  breaks the withholding rule — a previously withheld number would become the baseline.
- The reservations response shape in `ecom-api/dto` is an **assumed contract** and is
  validated, so a changed API fails loudly instead of degrading into `reserved = 0`.
- `regionCode` is sent with the reservations query, but it is **not settled** whether an e-com
  order reserves from one BC region or across all of them. If e-com ignores the parameter, the
  same reservation is subtracted from every region a variant lives in.
- **Prisma 7 needs a driver adapter** — `DatabaseService` constructs `PrismaPg` explicitly;
  `new PrismaClient()` with no adapter throws.
- The generated client goes to **`src/generated/prisma`** (gitignored) with
  `moduleFormat = "cjs"`, because the default ESM output uses `import.meta`, which ts-jest
  cannot load. Its imports carry `.js` specifiers that point at `.ts` files, so:
  - Jest needs `moduleNameMapper: {"^(\\.{1,2}/.*)\\.js$": "$1"}` (already in both configs).
  - The Prisma seed runs under **tsx**, not ts-node, which cannot resolve those specifiers.
- **Regenerate after every schema change** (`pnpm db:generate`) — a stale client produces
  type errors that look like code bugs.
- `tsconfig.build.json` pins `rootDir: ./src` and puts `tsBuildInfoFile` inside `dist/`.
  Without the former, `prisma/seed.ts` widens the inferred root and output lands in
  `dist/src/main.js`; without the latter, an incremental build after `deleteOutDir` emits
  nothing and `dist/main.js` silently goes missing.
- **Kafka topics are created at boot** by `KafkaAdminService`. Broker-side auto-creation is
  lazy, and a consumer subscribing to a topic nobody has produced to gets
  `UNKNOWN_TOPIC_OR_PARTITION`, which kafkajs treats as fatal.
- Topic names are read from `process.env` at import time in
  `shared/kafka/constants/kafka-topics.constant.ts`, because `@EventPattern` needs its value
  during decoration, before DI exists. Same reason `app.config.constants.ts` exists.
- Every shop belongs to a region; unmapped shops land in the `UNASSIGNED` region rather than
  a null one, so `EcomStock`'s `(variantId, regionId)` unique key cannot be defeated by
  Postgres treating NULLs as distinct.
- Ingest **never rethrows**. A message that cannot be applied is parked as `FAILED` in the
  `BcEvent` inbox with its raw payload, instead of being redelivered forever.
- The outbox drain assumes a **single writer** (an in-process guard). More than one instance
  needs `SELECT ... FOR UPDATE SKIP LOCKED` first.

## Testing

Unit specs live in the module's `specs/` folder, named `<subject>.spec.ts`, structured
`describe(ClassName) > describe(method) > it('should ...')`. Repositories and other services
are hand-mocked; the database is not exercised. HTTP-level tests live in `test/*.e2e-spec.ts`.

Type-checked eslint rules that fight Jest matchers (`no-unsafe-assignment`, `unbound-method`)
are disabled for spec files only — see `eslint.config.mjs`.
