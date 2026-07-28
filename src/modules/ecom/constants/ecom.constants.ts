/** Tuning for the outbox drain that carries stock updates to Kafka. */
export const ECOM_OUTBOX = {
  BATCH_SIZE: 100,
  /**
   * Safety net only: a publish is kicked off as soon as a calculation commits,
   * so this interval exists to retry failures and pick up anything missed.
   */
  POLL_INTERVAL_MS: 5000,
} as const;
