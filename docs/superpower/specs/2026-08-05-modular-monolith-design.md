# Modular monolith: PIM + stock (layer) + orders

**Status:** approved design, pre-implementation
**Date:** 2026-08-05

## Why the change

The original plan had three separate services: a PIM for product cards, this layer
service for stock calculation, and e-com holding its own orders. The business
direction changed: product cards, stock calculation and orders from *multiple*
e-coms should live in one system, shipped as an MVP quickly, but structured so the
domains can later be split into real microservices without rewrites.

Two consequences drive the design:

1. **Reservations become local.** All e-com orders land in our own orders domain,
   so the `reserved` term of the stock formula is a local read, not an HTTP call
   to e-com. The entire e-com degradation path (`EcomApiUnavailableError`, stale
   reservations carry-over, `reservationsStale`) disappears.
2. **The card/stock race must be solved by design.** BC publishes two Kafka
   events — product card and stock — at roughly the same time. Stock calculation
   must not be skipped because the card has not arrived yet.

## Decision

One NestJS monorepo, one running process, one Postgres database. Domains are
**libs**, not apps:

```
apps/
  monolith/            # the only entry point: bootstrap + AppModule importing the three domains
libs/
  pim/                 # product card: BC ingest, enrichment, publication to e-coms
  stock/               # today's layer: BC stock ingest, calculation, publication
  orders/              # orders from all e-coms, reservations
  shared/              # today's src/shared: Kafka, config, database, utils
```

Rationale for libs over per-domain apps: in a Nest monorepo `apps/` are deployable
units that are not meant to be imported by each other, while `libs/` are importable
modules — exactly "a service without a main.ts". Splitting a domain out later means
adding a thin `apps/<domain>/main.ts` that imports the existing lib; the domain code
does not move. Keeping unused per-domain bootstraps from day one would be dead code.

Each lib keeps the existing module anatomy: controller → facade → operation
services → repositories, `dto/`, `specs/`, constants over env for tuning.

### Import rules

- Path aliases are allowed **only at lib boundaries** (`@libs/pim`, `@libs/shared`, …).
  Inside a lib, deep relative imports remain the rule. The alias boundary *is* the
  service boundary.
- A lib's internals are private. Other libs may import only its module class and
  facade (and published types). No importing another lib's repositories or
  operation services.

### Database ownership

One Postgres, Prisma `multiSchema`, one Postgres schema per domain: `pim`,
`stock`, `orders`. Rules:

- A repository touches only its own schema.
- No cross-schema JOINs, no cross-schema foreign keys.
- Cross-domain reads go through the owning module's facade.

This keeps the future database split mechanical: tables that were never joined
across schemas can be moved out without untangling anything.

## Data flows

### Product card

BC → Kafka `bc.product` → **pim** ingests through the inbox pattern (as `BcEvent`
today), stores the raw card. Enrichment and moderation happen inside pim. On
approval pim writes to **its own outbox** → Kafka topic for published cards →
e-coms consume. E-coms only ever see what pim released.

### Stock

BC → Kafka `bc.stock` → **stock** applies unconditionally — exactly as today. A
stock event never needs the card to be applied; the event is never lost. Applying
enqueues a `StockRecalculationTask` in the same transaction (unchanged).

### Calculation and the card/stock race

`tryRecalculate` gathers:

- shops total — own tables (unchanged);
- `reserved` — **local call to the orders facade** (replaces the HTTP call);
- publication gate — call to the pim facade `isProductPublished(variantId)`.

If the card does not exist or is not yet published, the task is **left pending for
retry — never skipped**. The race dissolves: the card arrives seconds later and the
next retry sweep publishes the stock. The existing retry machinery
(`StockRecalculationTask`, attempts, abandon threshold, `/health` degradation) is
reused as is; "card missing" becomes one more reason a task stays pending.

### Orders and reservations

Each e-com gets an adapter in **orders**; orders are normalised into one model with
a `source` marker. The facade exposes reserved quantities per variant (and region,
same open question as today). When an order mutation changes reservations, orders
emits an in-process event (Nest `EventEmitter2`); stock subscribes and enqueues a
recalculation task for the affected variants.

An event rather than a direct call, to avoid a cycle: stock → orders is a facade
read, orders → stock is an event.

### Dependency direction

```
kafka(bc.product) → pim
kafka(bc.stock)   → stock → pim    (facade: is the card published?)
                    stock → orders (facade: reserved)
orders --event--> stock            (trigger recalculation)
```

Nothing points back. Each publishing domain (pim, stock) owns its outbox.

## What carries over unchanged

Inbox with `FAILED` parking, `toStockCommand` normalisation, retry machinery,
the `publishedQuantity` withholding rule, the `UNASSIGNED` region, the try/catch
convention, constants-over-env, controllers-call-facade-only.

## What is removed

`EcomApiService`, its assumed-contract DTO validation, `reservationsStale` and the
stale-carry-over logic, the `mock:ecom` stand-in. If orders lags behind reality,
that is an order-delivery problem in the orders domain, not a stock-calculation
degradation.

## Testing

Unit specs stay in each domain's `specs/` folder; neighbouring facades are
hand-mocked. E2e lives at the `apps/monolith` level. New key scenarios:

- stock event arrives before the card → task retries → card published → stock
  published;
- new order → event → recalculation of the affected variant;
- card exists but unpublished → stock withheld from publication.

## Out of scope (MVP)

- Splitting any domain into its own app/database.
- Distributed transactions or cross-service sagas — everything is one process,
  one database.
- The open business questions inherited from today's docs (region-scoped
  reservations, absolute-vs-delta from BC) remain open and are tracked where they
  are documented.
