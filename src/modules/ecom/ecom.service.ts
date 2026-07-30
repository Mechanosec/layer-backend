import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { TransactionClient } from '../../shared/database/types/database.type';
import { describeError, handleExceptionCode } from '../../shared/utils/utils';
import { EcomStockOutboxRepository } from './repositories/ecom-stock-outbox.repository';
import { EcomStockRepository } from './repositories/ecom-stock.repository';
import { EcomOutboxPublisherService } from './services/ecom.outbox-publisher.service';
import {
  EcomStockTarget,
  EcomStockValue,
  EcomStockSnapshot,
} from './types/ecom.type';

/**
 * Everything the service tells e-com. Owns both the stored result of the stock
 * calculation and the outbox that carries it to Kafka.
 */
@Injectable()
export class EcomService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly ecomStockRepository: EcomStockRepository,
    private readonly outboxRepository: EcomStockOutboxRepository,
    private readonly publisher: EcomOutboxPublisherService,
  ) {}

  /** What e-com was last told, so a caller can compare before overwriting it. */
  public async getCurrent(
    variantId: string,
    regionId: string,
  ): Promise<EcomStockSnapshot | null> {
    return this.ecomStockRepository.findCurrent(variantId, regionId);
  }

  /**
   * Stores a calculated result. `published` tells the repository whether this
   * number is the one e-com is being given, which is what keeps the comparison
   * baseline intact when a stale result is withheld.
   */
  public async saveCalculated(
    target: EcomStockTarget,
    value: EcomStockValue,
    reservationsStale: boolean,
    published: boolean,
    tx: TransactionClient,
  ): Promise<void> {
    try {
      await this.ecomStockRepository.upsert(
        target,
        value,
        reservationsStale,
        published,
        tx,
      );
    } catch (error) {
      const errorMessage = `[${EcomService.name}]Storing the calculated stock for ${target.sku}/${target.variantCode} in ${target.regionCode} was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);
      throw handleExceptionCode(error as Error, errorMessage);
    }
  }

  /**
   * Queues a number for publication. Call it in the transaction that produced the
   * number, so a committed calculation always has something to publish it.
   */
  public async enqueuePublication(
    target: EcomStockTarget,
    quantity: number,
    tx: TransactionClient,
  ): Promise<void> {
    try {
      await this.outboxRepository.enqueue(target, quantity, tx);
    } catch (error) {
      const errorMessage = `[${EcomService.name}]Queueing ${quantity} for ${target.sku}/${target.variantCode} in ${target.regionCode} was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);
      throw handleExceptionCode(error as Error, errorMessage);
    }
  }

  /** Fire-and-forget flush, for right after a transaction commits. */
  public publishSoon(): void {
    this.publisher.publishSoon();
  }

  public async publishPending(): Promise<number> {
    return this.publisher.publishPending();
  }

  /** How many stored numbers rest on reservations we could not confirm. */
  public async countStale(): Promise<number> {
    return this.ecomStockRepository.countStale();
  }
}
