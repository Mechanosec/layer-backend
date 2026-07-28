# pipeline

## Purpose

Read-only view of the whole flow, for explaining the stock calculation to people
who do not read logs. Backs the `layer-visualizer` page.

## Key responsibilities

- Assemble the full journey of one variant: what BC sent, the per-shop stock it
  produced, the calculation per region, what e-com was told, and anything blocked
- Expose reference data (shops, known variants) so a UI never invents codes
- Expose a recent-activity feed of inbox events and outbox rows
- Serialise Kafka offsets as strings — they are `bigint`, which JSON cannot carry

## Public API / Exports

- `GET /pipeline/stand` — shops and known variants
- `GET /pipeline/activity` — recent events and publications, newest first
- `GET /pipeline/trace/:sku/:variantCode` — the full journey

## Dependencies

- `shared/database` only

## Notes

Its repository reads several other modules' tables directly. That is deliberate:
the module exists to explain the whole flow, and routing every read through five
facades would obscure rather than protect. It writes nothing.
