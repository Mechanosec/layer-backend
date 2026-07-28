# stock

## Purpose

Owns the per-shop picture of stock and derives the quantity e-com may sell.

## Key responsibilities

- Apply product master data: season, product attributes, and one row per variant
- Apply stock: per variant/warehouse, replacing the quantity for an absolute value
  or adjusting it for a delta, clamped at zero
- Create products, variants and shops on first sight; unmapped shops land in the
  `UNASSIGNED` region so the calculation never meets a null region
- Gather the formula inputs, run the calculation, and hand the result to `ecom`
- Read reservations from e-com; when unavailable, carry the last known value over,
  flag the result stale, and record a retry task
- Retry blocked calculations on an interval until e-com answers, then abandon them
  past `RECALCULATION.MAX_ATTEMPTS`
- Serve the read model behind `GET /stock/:sku`

## Public API / Exports

- `StockService.applyCatalogue(command, tx)` — master data, no recalculation
- `StockService.applyStock(command, tx)` → `StockTarget[]` (transactional; also
  enqueues one recalculation task per affected variant/region pair)
- `StockService.recalculate(target)` — runs outside a transaction, calls e-com
- `StockService.tryRecalculate(targets)` — best-effort, for the ingest path
- `StockService.recalculateVariant(sku, variantCode)` — every region the variant
  holds stock in
- `StockService.getBySku(sku)`, `StockService.countBlockedCalculations()`
- `GET /stock/:sku`, `POST /stock/:sku/:variantCode/recalculate`

## Dependencies

- `EcomModule` — stores the result and queues publication
- `shared/ecom-api` — the reservations term
- `shared/database`, `shared/config`

## Notes

`services/stock.calculate.service.ts` holds the formula and is still partly a
mock — see `docs/superpower/stock-calculation.md`.
