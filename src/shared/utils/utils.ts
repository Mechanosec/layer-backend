import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Turns whatever a service caught into the error shape the API returns.
 *
 * The rules it encodes:
 *  - an unknown failure becomes a 400 carrying the service's own message, so the
 *    internals of a Prisma or driver error never reach a caller;
 *  - an error that is already an `HttpException` keeps its status **and** its
 *    numeric `code`, so a deliberate 404 or a domain code raised deep in a call
 *    chain is not flattened by the layers above it.
 *
 * Use it in the `catch` of an operation service, never in a repository.
 */
export const handleExceptionCode = (
  error: Error,
  errorMessage: string,
): HttpException => {
  const result = {
    statusCode: HttpStatus.BAD_REQUEST,
    message: errorMessage,
  } as {
    statusCode: number;
    message: string;
    code?: number;
  };

  if (error instanceof HttpException) {
    const response = error.getResponse() as { code?: number } | string;

    if (typeof response === 'object' && response.code) {
      result.code = response.code;
    }

    result.statusCode = error.getStatus();
  }

  return new HttpException(result, result.statusCode);
};

/**
 * The log form used by every `catch`: the whole error, including the fields
 * `JSON.stringify` drops on an `Error` (message, stack, cause).
 */
export const describeError = (error: unknown): string =>
  JSON.stringify(error, Object.getOwnPropertyNames(error));
