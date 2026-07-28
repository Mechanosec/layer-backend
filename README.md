# layer-backend

The **layer** service sits between Business Central (BC) and e-com. BC publishes stock
events onto Kafka; this service keeps the per-shop picture of stock, derives the quantity
that may be sold online, and publishes that number back onto Kafka for e-com.

```
Business Central ──▶ Kafka ──▶ layer ──▶ Postgres
                                 │
                                 └──▶ Kafka (ecom.stock.updated) ──▶ e-com
```

## The flow

1. **Ingest.** Two topics are consumed:
   - **product** (`bc.product.global`, BC calls it "загальний") — master data: the SKU, its
     season, hierarchy, customs codes, price, and every variant with its barcode, colour and
     size. **No quantities.**
   - **stock** (`bc.stock.unit`) — quantities per variant per warehouse.

   Every message is written to a `BcEvent` inbox keyed by `(topic, partition, offset)`, which
   makes redelivery a no-op instead of double-counting stock.

   > **BC has not settled the stock shape.** It may nest `warehouses[]` inside each variant or
   > name a single `warehouseCode` for the whole message, and may send an absolute `quantity`
   > or a signed `quantityDelta`. All four combinations are accepted and normalised into one
   > command in `bc-events.service.ts`; nothing downstream knows the difference. When BC
   > decides, delete the branches that are left unused.

2. **Apply.** A product message upserts the catalogue and touches no stock. A stock message
   sets each variant/warehouse quantity — replacing it for an absolute value, adjusting it in
   a single statement for a delta, clamped at zero. Shops and products BC has not described
   yet are created on the fly; an unmapped warehouse is created **excluded from e-com**, so
   its stock is kept but nothing is published under the placeholder region.

3. **Calculate.** For the affected variant and region:

   ```
   ecom = sum(stock in the ecom-enabled shops of the region) - safetyBuffer - reserved
   ```

   The first two terms are layer's own data. `reserved` — the units sitting in orders with
   status "Новий" — **lives in e-com**, so it is read over its API during the calculation
   (`src/shared/ecom-api`). That is why applying an event and calculating from it are two
   separate steps: an HTTP call has no place inside a database transaction.

   > **The formula is still partly a mock.** See
   > `src/modules/stock/services/stock.calculate.service.ts` for what remains open — chiefly
   > whether the safety buffer is per region, shop or variant, and whether an e-com order
   > reserves from one BC region or across all of them.

4. **Publish.** The result is stored in `EcomStock` (with the inputs kept, so any published
   number can be explained) and queued in `EcomStockOutbox` **in the same transaction**. A
   background drain publishes the queue to `ecom.stock.updated`; a failed publish leaves the
   row `PENDING` for the next tick.

## When e-com cannot be reached

An unreachable e-com must never be read as "nothing is reserved" — that overstates stock and
invites overselling. So instead:

- The last known `reserved` is carried over and the result is flagged `reservationsStale`.
- The pair is recorded in `StockRecalculationTask`, and `StockRetryRecalculationService`
  re-runs it every 30s — for up to `RECALCULATION.MAX_ATTEMPTS` (10) attempts, so about
  five minutes. Stock catches up on its own, with nobody replaying BC events. Ordinary BC
  traffic does **not** reset that counter: if it did, the busiest SKUs would never abandon
  and never surface as degraded.
- A stale result is published **only if it does not raise** what e-com may sell. A drop in
  shop stock still propagates; an increase waits for real data. The comparison is against
  `EcomStock.publishedQuantity` (what e-com actually holds), not against the last computed
  `quantity`, so a withheld result cannot destroy the baseline.
- After `RECALCULATION.MAX_ATTEMPTS` a task becomes `ABANDONED` and `/health` reports
  `status: degraded` — that is the signal for a human.

`GET /health` exposes the whole picture: `pendingRecalculations`, `abandonedRecalculations`
and `staleQuantities`. All zero means every published number rests on confirmed reservations.

## Running it

Requires Node 22+, pnpm, and Docker or Podman.

**One command for the whole stand** — containers, migrations, reference data, the
e-com stub, the service and the visualiser:

```bash
./start-demo.sh          # or: pnpm demo
```

It prints the URLs when everything answers, and `Ctrl+C` stops what it started.
Containers stay up so the database survives; `pnpm infra:down` stops them.
Useful flags: `--fresh` (wipe demo products and events), `--no-install`,
`--no-open`. Logs land in `.demo-logs/`.

Piece by piece, if you would rather drive it yourself:

```bash
cp .env.example .env
pnpm install
pnpm infra:up        # Postgres + Kafka (KRaft, single node)
pnpm db:migrate      # apply migrations
pnpm db:seed         # regions and shops — reference data BC does not send yet
pnpm mock:ecom       # in another terminal — the calculation needs it
pnpm start:dev
```

Swagger is served at http://localhost:3000/docs, health at `/health`.

Outside production, `POST /bc/simulate/product` and `POST /bc/simulate/stock` inject BC
payloads straight into the ingest pipeline, so the calculation can be exercised without a
real producer:

```bash
# the product card
curl -X POST http://localhost:3000/bc/simulate/product -H 'Content-Type: application/json' -d '{
  "sku":"200202","name":"Кросівки жіночі","unitMeasure":"ПАР","brand":"NORBY","price":699.00,
  "season":{"name":"ВЕСНА 2025","startingDate":"2025-03-01","endingDate":"2025-05-31"},
  "productHierarchy":{"division":"ОДЯГ","category":"Кросівки","retailProductCode":"КРОСІВКИ ЖІНОЧІ"},
  "customCategoryCode":"6402999100","customCategoryCodeDescription":"менш як 24 см",
  "variants":[{"variantCode":"000","barcodeNo":"770662476000","color":"КОРИЧНЕВИЙ","size":"42"}]}'

# and the quantities
curl -X POST http://localhost:3000/bc/simulate/stock -H 'Content-Type: application/json' -d '{
  "sku":"200202","variants":[{"variantCode":"000","barcodeNo":"770662476000","price":699.00,
  "warehouses":[{"warehouseCode":"0119","quantity":10},{"warehouseCode":"0120","quantity":4}]}]}'

curl http://localhost:3000/stock/200202
```

### Заглушка ECOM

Розрахунок звертається до e-com за резервами, тому для локальної роботи потрібна
відповідь з того боку:

```bash
pnpm mock:ecom     # http://localhost:4000
```

Її можна перемикати в режими `ok`, `down`, `slow` і `garbage`, щоб перевірити, як
сервіс поводиться без свіжих резервів:

```bash
curl -X PUT http://localhost:4000/_state -H 'content-type: application/json' \
  -d '{"reserved":4,"mode":"down"}'
```

### Візуалізатор

Папка `visualizer/` показує весь цей потік на одній сторінці —
конвеєр, лента розрахунку і журнал, українською, для менеджера. Він читає
`/pipeline/*` і нічого не змінює поза API цього сервісу.

### Podman

There is no Docker daemon on the dev machine; `docker-compose` talks to the Podman socket:

```bash
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm start:dev` | dev server with watch |
| `pnpm build` / `pnpm start:prod` | compile to `dist/` and run it |
| `pnpm test` | unit tests (`src/**/specs/*.spec.ts`) |
| `pnpm test -- stock.calculate` | a single suite |
| `pnpm test:e2e` | HTTP tests in `test/` |
| `pnpm lint` | eslint with `--fix` |
| `pnpm db:migrate` / `db:deploy` | create+apply / apply migrations |
| `pnpm db:generate` | regenerate the Prisma client |
| `pnpm db:seed` | seed regions and shops |
| `pnpm db:studio` | Prisma Studio |
| `pnpm infra:up` / `infra:down` / `infra:logs` | the compose stack |
| `pnpm demo` | the whole stand in one command — see `./start-demo.sh --help` |
| `pnpm mock:ecom` | e-com reservations stub on :4000 |

## Layout

```
src/
├── main.ts                      bootstrap: pipes, filters, Swagger, Kafka consumer
├── modules/                     business logic
│   ├── app.module.ts            root module
│   ├── bc-events/               Kafka ingest + inbox/idempotency
│   ├── stock/                   per-shop stock, the calculation, retry worker, read API
│   ├── ecom/                    calculated result + outbox publishing
│   └── health/
└── shared/                      integrations and third-party clients
    ├── shared.module.ts         @Global: config, database, Kafka, e-com API
    ├── config/                  env class, validation, typed accessors
    ├── database/                Prisma client + repository plumbing
    ├── ecom-api/                reservations lookup (the one term layer does not own)
    ├── kafka/                   producer, admin (topic creation), topic constants
    ├── filters/                 Prisma → HTTP error mapping
    └── swagger/

tools/mock-ecom.mjs              e-com reservations stub for local runs
start-demo.sh                    the whole stand in one command
visualizer/                      the page that explains the flow (its own README)
docs/                            modules/ and superpower/ — read before a task
```

Each module follows the same shape: a `*.module.ts`, a thin `*.controller.ts`, a facade
`*.service.ts` that delegates to one service per operation in `services/`, thin Prisma
`repositories/`, plus `dto/`, `response/`, `types/`, `constants/` and `specs/` as needed.
Controllers talk only to the facade.

## Configuration

`.env` holds **deployment configuration only** — addresses, credentials, switches. Every
variable is declared and validated in `src/shared/config/environment.config.ts` and read
through `AppConfigService`; nothing else touches `process.env`. The service refuses to start
on an invalid environment rather than running misconfigured.

Tuning values are **constants next to the code that uses them**, not environment variables,
because changing one is a decision that should be reviewed rather than a deployment knob:

| Constant | Covers |
| --- | --- |
| `src/shared/ecom-api/constants/ecom-api.constants.ts` | reservations endpoint path, timeout, retries, back-off |
| `src/modules/stock/constants/stock.constants.ts` | retry interval/batch/attempt ceiling, default safety buffer, `UNASSIGNED` region |
| `src/modules/ecom/constants/ecom.constants.ts` | outbox batch size and poll interval |
