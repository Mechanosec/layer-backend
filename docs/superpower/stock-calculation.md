# Stock calculation

## What it enables

Turns a per-shop stock picture into the single number e-com may sell for a variant
in a region.

## How it works

```
ecom = sum(stock in the ecom-enabled shops of the region)
       - safetyBuffer
       - units in orders with status "Новий"
```

- The first two terms are layer's own data (`ShopStock`, `Region.safetyBuffer`)
- The third lives in **e-com** and is read over its API during the calculation
- The result is clamped at zero
- Every input is stored alongside the result on `EcomStock`, so a published number
  can always be explained

Inputs are gathered in `stock.recalculate.service.ts`; the arithmetic is isolated
in `stock.calculate.service.ts`, so replacing the formula is one method body.

## Still open

- Is `safetyBuffer` per region, per shop, or per variant? Currently per region,
  which is how "в обраних магазинах регіона" reads — but that is an inference.
- Does an e-com order reserve from one BC region or across all of them?
  `regionCode` is sent with the reservations query; if e-com ignores it, the same
  reservation is subtracted from every region the variant lives in.
- When does BC decrement shop stock — at order creation, picking, or shipment?
  Subtracting `NEW` orders is only correct while BC still counts those goods in the
  shop. Any gap between BC decrementing and the order leaving `NEW` is a window of
  double-counting or, worse, overselling. This is the highest-risk unknown.
- Should a variant with stock only in non-selected shops read 0, or be hidden?

## Related modules

- `docs/modules/stock.md`, `docs/modules/ecom.md`
- `docs/superpower/ecom-reservations.md`
