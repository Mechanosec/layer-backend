# ecom

## Purpose

Everything the service tells e-com. Owns the stored result of the stock
calculation and the outbox that carries it to Kafka.

## Key responsibilities

- Store one `EcomStock` row per variant/region with the full formula breakdown, so
  any published number can be explained
- Keep `publishedQuantity` (what e-com actually holds) separate from `quantity`
  (last computed) — the baseline a withheld stale result is compared against
- Queue publications in `EcomStockOutbox` inside the caller's transaction, so a
  committed calculation always has something to publish it
- Drain the outbox to `ecom.stock.updated`; a failed publish leaves the row
  `PENDING` for the next tick
- Count stale quantities for `/health`

## Public API / Exports

- `EcomService.getCurrent(variantId, regionId)` → `EcomStockSnapshot | null`
- `EcomService.saveCalculated(target, value, reservationsStale, published, tx)`
- `EcomService.enqueuePublication(target, quantity, tx)`
- `EcomService.publishSoon()` / `publishPending()` / `countStale()`

## Dependencies

- `shared/kafka` — the producer and the `ecom.stock.updated` topic
- `shared/database`

## Notes

The drain assumes a single writer (an in-process guard). More than one instance
needs `SELECT ... FOR UPDATE SKIP LOCKED` first.
