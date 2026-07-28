/**
 * Region every shop is parked in until Business Central tells us which region it
 * really belongs to. Keeps `Shop.regionId` non-null, so the calculation never
 * has to special-case a missing region.
 */
export const UNASSIGNED_REGION_CODE = 'UNASSIGNED';
export const UNASSIGNED_REGION_NAME = 'Не призначено';

/**
 * Safety buffer given to regions the service has to create on the fly. Zero, so
 * an unmapped shop never silently withholds stock; real regions get their buffer
 * from the `Region` row.
 */
export const DEFAULT_SAFETY_BUFFER = 0;

/** Tuning for the worker that retries calculations e-com blocked. */
export const RECALCULATION = {
  RETRY_INTERVAL_MS: 30_000,
  RETRY_BATCH_SIZE: 50,
  /**
   * After this many failed attempts a task is ABANDONED: the worker stops
   * retrying and the backlog on /health surfaces it for a human.
   */
  MAX_ATTEMPTS: 10,
} as const;
