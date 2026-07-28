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
`StockLine` per variant/warehouse pair. Everything downstream sees only "set this
quantity" or "adjust by this much". When BC decides, delete the unused branches in
that one function — nothing else needs touching.

Two rules are load-bearing:

- A line with **neither** `quantity` nor `quantityDelta` is rejected. Applying it
  would silently zero the stock of a real warehouse.
- `price` on a stock message is accepted so the message is not rejected, and stored
  on the variant for reference, but no stock logic reads it. Nobody has explained why
  a stock message carries a price; the catalogue price stays authoritative.

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
