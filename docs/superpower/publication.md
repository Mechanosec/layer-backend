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
4. On success it marks the rows `SENT` and stamps `EcomStock.publishedAt`; on failure
   the rows stay `PENDING`, with `attempts` and `lastError` recorded, for the next tick

Topics are created at boot by `KafkaAdminService`. Broker-side auto-creation is lazy,
and a consumer subscribing to a topic nobody has produced to gets
`UNKNOWN_TOPIC_OR_PARTITION`, which kafkajs treats as fatal.

## Constraints

- **Single writer.** The drain is guarded in-process only. Running more than one
  instance needs a real claim step (`SELECT ... FOR UPDATE SKIP LOCKED`).
- `publishedQuantity` is written only when a number is actually handed over, so a
  withheld stale result cannot destroy the comparison baseline.

## Related modules

- `docs/modules/ecom.md`, `docs/modules/shared.md`
- `docs/superpower/ecom-reservations.md`
