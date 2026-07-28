/** Outcome of handing one Business Central message to the ingest pipeline. */
export enum EIngestOutcome {
  /** Applied, recalculated, and queued for e-com. */
  Processed = 'processed',
  /** Already in the inbox — the same (topic, partition, offset) was seen before. */
  Duplicate = 'duplicate',
  /** Payload failed validation; parked in the inbox as FAILED. */
  Invalid = 'invalid',
  /** Valid but could not be applied; parked in the inbox as FAILED. */
  Failed = 'failed',
}
