# E-com reservations

## What it enables

The one term of the stock formula layer does not own. Orders live in e-com, so the
reserved quantity is fetched synchronously at calculation time — and the service
stays correct when e-com cannot answer.

## How it works

`EcomApiService` calls `GET {ECOM_API_URL}/api/reservations?sku=&variantCode=&regionCode=`
with a 3s timeout and two retries. The response shape is an **assumed contract** and
is validated, so a changed API fails loudly rather than degrading into `reserved = 0`.

Every failure mode — timeout, non-2xx, unparseable or invalid body — surfaces as
`EcomApiUnavailableError`. The service never substitutes a fallback: a wrong
`reserved` overstates stock and invites overselling, so deciding what to do without
it belongs to the caller.

### Degradation

When e-com cannot answer, `StockRecalculateService`:

1. carries the **last known** `reserved` over — never zero
2. flags the stored result `reservationsStale`
3. records a `StockRecalculationTask` for the variant/region pair
4. publishes the number **only if it does not raise** what e-com may sell

Rule 4 is the safety property: a drop in shop stock still propagates (which is what
protects against overselling), while an increase waits for real data. The comparison
is against `EcomStock.publishedQuantity` — the number e-com actually holds — not
against `quantity`, which may itself be a previously withheld result. With nothing
ever published there is no safe baseline and the number is withheld entirely.

### Recovery

`StockRetryRecalculationService` re-runs pending tasks every 30s, so stock catches up
on its own once the API is back, with nobody replaying BC events. Past
`RECALCULATION.MAX_ATTEMPTS` a task becomes `ABANDONED` and `/health` reports
`degraded`.

## Why synchronous

Chosen over an event feed from e-com because it needs no new integration on the
e-com side and is always fresh. The cost is a dependency in the calculation path,
which is why the HTTP call is deliberately kept **outside** any database
transaction — see `docs/superpower/event-ingestion.md`.

## Related modules

- `docs/modules/stock.md`, `docs/modules/ecom.md`, `docs/modules/shared.md`
