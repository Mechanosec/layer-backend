import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { RECALCULATION } from '../constants/stock.constants';
import { StockRecalculationTaskRepository } from '../repositories/stock-recalculation-task.repository';
import { StockRecalculateService } from './stock.recalculate.service';

/**
 * The handler behind a blocked calculation.
 *
 * Any pair whose calculation could not be completed — practically always because
 * e-com was unreachable when its reservations were needed — sits PENDING in
 * StockRecalculationTask. This worker re-runs them, so e-com stock catches up on
 * its own once the API is back, without anyone replaying BC events.
 *
 * Single-writer, like the outbox drain: the in-process guard is what stops two
 * runs of the same task overlapping.
 */
@Injectable()
export class StockRetryRecalculationService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly logger: PinoLogger,
    private readonly taskRepository: StockRecalculationTaskRepository,
    private readonly recalculateService: StockRecalculateService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.retryPending();
    }, RECALCULATION.RETRY_INTERVAL_MS);

    // Do not hold the event loop open on shutdown.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Returns how many pairs were brought up to date. */
  public async retryPending(): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;

    try {
      const tasks = await this.taskRepository.findPending(
        RECALCULATION.RETRY_BATCH_SIZE,
      );

      if (tasks.length === 0) {
        return 0;
      }

      this.logger.info(
        `[${StockRetryRecalculationService.name}]Retrying ${tasks.length} blocked calculation(s)`,
      );

      let recovered = 0;

      for (const task of tasks) {
        const target = {
          variantId: task.variantId,
          regionId: task.regionId,
          sku: task.sku,
          variantCode: task.variantCode,
          regionCode: task.regionCode,
        };

        try {
          const result = await this.recalculateService.run(target);

          // A stale result means e-com is still down; run() has already counted
          // the attempt and will abandon the task once it runs out.
          if (!result.reservationsStale) {
            recovered += 1;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : JSON.stringify(error);

          this.logger.error(
            `[${StockRetryRecalculationService.name}]Retrying ${task.sku}/${task.variantCode} in ${task.regionCode} failed with error: ${message}`,
          );
          await this.taskRepository.recordUnavailableReservations(
            target,
            message,
            RECALCULATION.MAX_ATTEMPTS,
          );
        }
      }

      if (recovered > 0) {
        this.logger.info(
          `[${StockRetryRecalculationService.name}]Recovered ${recovered} of ${tasks.length} calculation(s)`,
        );
      }

      return recovered;
    } finally {
      this.running = false;
    }
  }
}
