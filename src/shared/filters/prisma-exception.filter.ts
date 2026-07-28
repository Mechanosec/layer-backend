import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

import { Prisma } from '../../generated/prisma/client';

/**
 * Maps the Prisma error codes the service relies on onto HTTP responses, so
 * repositories can use `findUniqueOrThrow` without every caller adding a guard.
 * Anything unmapped falls through to Nest's default handling as a 500.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const mapped = this.toHttpException(exception);

    if (!mapped) {
      this.logger.error(
        `[${PrismaExceptionFilter.name}]Unmapped Prisma error ${exception.code}: ${exception.message}`,
      );
      super.catch(exception, host);
      return;
    }

    super.catch(mapped, host);
  }

  private toHttpException(
    exception: Prisma.PrismaClientKnownRequestError,
  ): HttpException | undefined {
    switch (exception.code) {
      case 'P2025':
        return new NotFoundException('Requested record does not exist');
      case 'P2002':
        return new ConflictException('Record already exists');
      case 'P2003':
        return new ConflictException('Related record does not exist');
      default:
        return undefined;
    }
  }
}
