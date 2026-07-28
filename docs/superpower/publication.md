# Publication to e-com

## What it enables

A calculated quantity can never be committed without something to deliver it, and a
broker outage cannot lose an update.

## How it works

Transactional outbox:

1. `StockRecalculateService` stores the result and writes an `EcomStockOutbox` row in
   the **same transaction**
2. After the commit it kicks a drain; a 5s interval is the safety net
3. `EcomOutboxPublisherService` publishes a batch to `ecom.stock.updated`, keyed
   `sku:variantCode` so a variant's updates keep their order within a partition
4. On success it marks the rows `SENT` and stamps `EcomStock.publishedAt` for the
   exact `(variantId, regionId)` pairs it delivered — which is why the outbox row
   carries `regionId`. Stamping by variant alone would mark a variant's other
   regions as delivered, including ones deliberately withheld
5. On failure the rows stay `PENDING`, with `attempts` and `lastError` recorded, for
   the next tick

Topics are created at boot by `KafkaAdminService`. Broker-side auto-creation is lazy,
and a consumer subscribing to a topic nobody has produced to gets
`UNKNOWN_TOPIC_OR_PARTITION`, which kafkajs treats as fatal.

## Constraints

- **Single writer.** The drain is guarded in-process only. Running more than one
  instance needs a real claim step (`SELECT ... FOR UPDATE SKIP LOCKED`).
- `publishedQuantity` is written when a number is **enqueued**, not when Kafka
  accepts it — so it is "the last number we committed to sending", not literally
  what e-com has processed. The outbox preserves order and guarantees delivery, so
  the gap is bounded by the drain interval. What matters for the withholding rule is
  that a *withheld* result never touches it, which is what keeps the baseline
  intact.

## Related modules

- `docs/modules/ecom.md`, `docs/modules/shared.md`
- `docs/superpower/ecom-reservations.md`
