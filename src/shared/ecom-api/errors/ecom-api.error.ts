/**
 * Raised when e-com could not tell us how much of a variant is reserved.
 *
 * Distinguished from any other failure on purpose: the caller must not treat an
 * unreachable e-com as "nothing is reserved", which would overstate stock and
 * invite overselling.
 */
export class EcomApiUnavailableError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = EcomApiUnavailableError.name;
  }
}
