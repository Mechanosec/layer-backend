# Event ingestion

## What it enables

Business Central events change stock exactly once, whatever Kafka does with
delivery, and a message that cannot be applied never blocks the stream.

## How it works

### Idempotency

Every message is written to the `BcEvent` inbox with a unique
`(topic, partition, offset)`. A redelivered message inserts zero rows and is
skipped. This matters because an absolute quantity is idempotent but a *delta* is
not — applying `-3` twice is simply wrong — and BC has not yet said which it will
send (`docs/superpower/bc-messages.md`).

### Transaction boundary

The transaction covers **applying the event plus enqueuing a recalculation task**,
and nothing else:

```
tx { apply event → enqueue StockRecalculationTask → mark BcEvent PROCESSED }
then, outside tx: run the calculation (calls e-com over HTTP)
```

The split is deliberate. Applying is pure database work and must be atomic. The
calculation needs e-com's reservations over HTTP, which has no place inside a
transaction — it would hold a Postgres connection for as long as e-com takes — and
it is derived data that can always be recomputed. So the transaction commits "the
stock changed and owes a recalculation", and the calculation follows.

A calculation that fails only delays publication: the task is already committed and
the retry worker owns it from there.

### Failure handling

Ingest never rethrows. A malformed or unappliable message is parked as `FAILED` in
the inbox with its raw payload, so a fix can replay it, instead of being redelivered
forever.

### Coalescing

Recalculation tasks are unique per `(variantId, regionId)`, so a burst of ten events
for one variant collapses into one outstanding calculation. The same key also means a
single stock message touching four warehouses of one region produces one calculation,
not four — `StockApplyStockService` deduplicates its targets before they are queued.

## Related modules

- `docs/modules/bc-events.md`, `docs/modules/stock.md`
- `docs/superpower/publication.md`
