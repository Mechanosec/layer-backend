# bc-events

## Purpose

Entry point for Business Central. Consumes two Kafka topics, guards against
redelivery, and translates BC's payloads into stock domain commands.

## Key responsibilities

- Consume the **product** topic (master data: SKU, season, hierarchy, customs codes,
  price, and every variant with barcode/colour/size — no quantities) and the
  **stock** topic (quantities per variant per warehouse)
- Record every message in the `BcEvent` inbox, keyed by
  `(topic, partition, offset)` — redelivery becomes a no-op
- Validate payloads; park malformed ones as `FAILED` instead of rethrowing, so a
  bad message is never redelivered forever
- Normalise the stock message from any of the four shapes BC is considering into a
  flat list of variant/warehouse lines
- Apply the message and enqueue recalculations in one transaction, then run the
  calculations outside it (they need an HTTP call to e-com)

## Public API / Exports

- `BcEventsService.ingestProduct(payload, meta)` → `EIngestOutcome`
- `BcEventsService.ingestStock(payload, meta)` → `EIngestOutcome`
- `EIngestOutcome`: `processed` | `duplicate` | `invalid` | `failed`
- `POST /bc/simulate/product`, `POST /bc/simulate/stock` — non-production only

## Dependencies

- `StockModule` — applying messages and recalculating
- `shared/database`, `shared/kafka` (topic constants, message metadata types)

## Notes

`toStockCommand` is the seam that absorbs BC's undecided shape — see
`docs/superpower/bc-messages.md`. A line carrying neither `quantity` nor
`quantityDelta` is rejected rather than applied as zero.
