/**
 * Tuning for the e-com reservations call. Deliberately constants rather than
 * environment variables: these are properties of the integration, and changing
 * one is a code change that should be reviewed, not a deployment knob.
 *
 * The budget matters — the call sits in the path of every recalculation, so the
 * worst case is TIMEOUT_MS * (RETRIES + 1) plus the back-off delays.
 */
export const ECOM_API = {
  /** Endpoint that answers "how much of this variant is in NEW orders?". */
  RESERVATIONS_PATH: '/api/reservations',
  TIMEOUT_MS: 3000,
  /** Retries on top of the first attempt. */
  RETRIES: 2,
  /** Multiplied by the attempt number, so back-off is 200ms, then 400ms. */
  RETRY_DELAY_MS: 200,
} as const;
