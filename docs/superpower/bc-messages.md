# Business Central messages

## What it enables

The rest of the service is written against two stable domain commands, while BC is
still changing what it actually sends.

## The two messages

**Product** ("загальний") — master data for a SKU: name, brand, `unitMeasure`,
`price`, `season` (name + dates), `productHierarchy` (division, category,
retailProductCode), customs codes, and a `variants[]` array where each entry has
`variantCode`, `barcodeNo`, `color` and `size`.

It carries **no quantities**, so applying it changes nothing that feeds the stock
formula and triggers no recalculation. Note where the attributes sit: `unitMeasure`,
`price` and the customs codes are outside `variants`, which is why they are stored on
`Product` and not on `ProductVariant`.

**Stock** — quantities per variant per warehouse. BC has not settled its shape, and
all four combinations under discussion are accepted:

| Warehouses | Number | Shape |
| --- | --- | --- |
| nested per variant | absolute | `variants[].warehouses[].quantity` |
| nested per variant | delta | `variants[].warehouses[].quantityDelta` |
| one per message | absolute | `warehouseCode` + `variants[].quantity` |
| one per message | delta | `warehouseCode` + `variants[].quantityDelta` |

## How it works

`toStockCommand` in `bc-events.service.ts` flattens whichever shape arrived into one
`StockLine` per variant/warehouse pair. The *warehouse* dimension is fully
normalised. The absolute-vs-delta dimension is carried through as two optional
fields and branched on in `StockApplyStockService`, so settling the contract means
editing that service and the domain command too, not only the mapper.

Three rules are load-bearing:

- A line with **neither** `quantity` nor `quantityDelta` is rejected. Applying it
  would silently zero the stock of a real warehouse. `null` counts as absent:
  `@IsOptional()` skips validation for `null`, so a producer emitting the unused
  field as `null` would otherwise arrive looking like an absolute zero.
- A line carrying **both**, or a variant mixing `warehouses[]` with a bare
  `quantity`, is rejected rather than silently resolved — one of BC's numbers would
  be dropped, and while the contract is unsettled a guess is worse than a failure.
- `price` and `barcodeNo` on a stock message are accepted so the message is not
  rejected, then **discarded**. The catalogue message owns master data. Writing
  `barcodeNo` from here would give a unique-ish column a second writer, and a reused
  or corrected EAN would roll back the whole apply transaction — freezing every
  quantity in that message over a data-quality wobble. A price written from a
  quantity feed would likewise race the catalogue with no ordering between topics.

Absolute values are idempotent on replay; deltas are not. That is why the inbox guard
in `docs/superpower/event-ingestion.md` is not optional while the shape is undecided.

## Still open

- Which stock shape BC will settle on, and whether it will be absolute or a delta
- Whether a nested-warehouse message lists **all** warehouses for the SKU or only the
  changed ones. If it is complete, warehouses omitted from it could be zeroed; today
  they are left untouched, which is the safe reading.
- BC calls it `warehouseCode`; the manager's formula and the seed call the same thing
  a shop. Stored as `Shop.code`.

## Related modules

- `docs/modules/bc-events.md`, `docs/modules/stock.md`
- `docs/superpower/event-ingestion.md`
