import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { KAFKA_TOPICS } from '../../../shared/kafka/constants/kafka-topics.constant';
import { KafkaProducerService } from '../../../shared/kafka/kafka-producer.service';
import { ECOM_OUTBOX } from '../constants/ecom.constants';
import { EcomStockOutboxRepository } from '../repositories/ecom-stock-outbox.repository';
import { EcomStockRepository } from '../repositories/ecom-stock.repository';
import { EcomStockMessage } from '../types/ecom.type';

/**
 * Drains the e-com stock outbox onto Kafka.
 *
 * Rows are written in the same transaction as the calculation, so this service
 * only has to get them out: a failed publish leaves the row PENDING and the
 * next tick retries it.
 *
 * Single-writer by design — the in-process guard is what keeps a row from being
 * sent twice. Running more than one instance needs a real claim step
 * (SELECT ... FOR UPDATE SKIP LOCKED) before that assumption holds.
 */
@Injectable()
export class EcomOutboxPublisherService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  private draining = false;

  constructor(
    private readonly logger: PinoLogger,
    private readonly outboxRepository: EcomStockOutboxRepository,
    private readonly ecomStockRepository: EcomStockRepository,
    private readonly producer: KafkaProducerService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.publishPending();
    }, ECOM_OUTBOX.POLL_INTERVAL_MS);

    // Do not hold the event loop open on shutdown.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Publish without waiting for the next tick, e.g. right after ingesting an event. */
  public publishSoon(): void {
    void this.publishPending();
  }

  public async publishPending(): Promise<number> {
    if (this.draining) {
      return 0;
    }
    this.draining = true;

    try {
      const pending = await this.outboxRepository.findPending(
        ECOM_OUTBOX.BATCH_SIZE,
      );

      if (pending.length === 0) {
        return 0;
      }

      const ids = pending.map((row) => row.id);

      try {
        await this.producer.publish(
          KAFKA_TOPICS.ecomStock,
          pending.map((row) => ({
            key: `${row.sku}:${row.variantCode}`,
            value: {
              sku: row.sku,
              variantCode: row.variantCode,
              regionCode: row.regionCode,
              quantity: row.quantity,
              calculatedAt: row.createdAt.toISOString(),
            } satisfies EcomStockMessage,
          })),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : JSON.stringify(error);

        this.logger.error(
          `[${EcomOutboxPublisherService.name}]Publishing ${pending.length} stock update(s) failed with error: ${message}`,
        );
        await this.outboxRepository.recordFailure(ids, message);

        return 0;
      }

      const sentAt = new Date();
      await this.outboxRepository.markSent(ids, sentAt);
      await this.ecomStockRepository.markPublished(
        pending.map((row) => ({
          variantId: row.variantId,
          regionId: row.regionId,
        })),
        sentAt,
      );

      this.logger.info(
        `[${EcomOutboxPublisherService.name}]Published ${pending.length} stock update(s) to ${KAFKA_TOPICS.ecomStock}`,
      );

      return pending.length;
    } finally {
      this.draining = false;
    }
  }
}
