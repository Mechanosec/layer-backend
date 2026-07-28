# bc-events

## Purpose

Entry point for Business Central stock events. Consumes two Kafka topics, guards
against redelivery, and turns transport payloads into stock domain commands.

## Key responsibilities

- Consume `bc.stock.global` (absolute quantity per variant per shop) and
  `bc.stock.unit` (signed delta)
- Record every message in the `BcEvent` inbox, keyed by
  `(topic, partition, offset)` — redelivery becomes a no-op
- Validate payloads; park malformed ones as `FAILED` instead of rethrowing, so a
  bad message is never redelivered forever
- Map DTOs to `StockSnapshotCommand` / `StockDeltaCommand`, so the stock module
  never sees a Kafka payload shape
- Apply the event and enqueue a recalculation in one transaction, then run the
  calculation outside it (it needs an HTTP call to e-com)

## Public API / Exports

- `BcEventsService.ingestGlobal(payload, meta)` → `EIngestOutcome`
- `BcEventsService.ingestUnit(payload, meta)` → `EIngestOutcome`
- `EIngestOutcome`: `processed` | `duplicate` | `invalid` | `failed`
- `POST /bc/simulate/global`, `POST /bc/simulate/unit` — non-production only,
  injects a payload straight into the pipeline

## Dependencies

- `StockModule` — applying events and recalculating
- `shared/database`, `shared/kafka` (topic constants, message metadata types)
