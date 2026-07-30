import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { DatabaseService } from '../../../shared/database/database.service';
import { EcomApiService } from '../../../shared/ecom-api/ecom-api.service';
import { EcomApiUnavailableError } from '../../../shared/ecom-api/errors/ecom-api.error';
import {
  describeError,
  handleExceptionCode,
} from '../../../shared/utils/utils';
import { EcomService } from '../../ecom/ecom.service';
import { EcomStockSnapshot } from '../../ecom/types/ecom.type';
import { RECALCULATION } from '../constants/stock.constants';
import { RegionRepository } from '../repositories/region.repository';
import { ShopStockRepository } from '../repositories/shop-stock.repository';
import { StockRecalculationTaskRepository } from '../repositories/stock-recalculation-task.repository';
import { StockRecalculationResult, StockTarget } from '../types/stock.type';
import { StockCalculateService } from './stock.calculate.service';

/**
 * Runs the calculation for one variant/region pair and gets the result to e-com.
 *
 * Deliberately **not** transactional around the whole thing: the reservations
 * term comes from an HTTP call to e-com, and holding a Postgres transaction open
 * across it would tie up a connection for as long as e-com takes to answer.
 * Callers enqueue a task first (see StockRecalculationTaskRepository), so a run
 * that never completes is retried rather than lost.
 */
@Injectable()
export class StockRecalculateService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly database: DatabaseService,
    private readonly shopStockRepository: ShopStockRepository,
    private readonly regionRepository: RegionRepository,
    private readonly taskRepository: StockRecalculationTaskRepository,
    private readonly calculateService: StockCalculateService,
    private readonly ecomApiService: EcomApiService,
    private readonly ecomService: EcomService,
  ) {}

  public async run(target: StockTarget): Promise<StockRecalculationResult> {
    try {
      return await this.calculateAndStore(target);
    } catch (error) {
      const errorMessage = `[${StockRecalculateService.name}]Recalculating ${target.sku}/${target.variantCode} in ${target.regionCode} was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);
      throw handleExceptionCode(error as Error, errorMessage);
    }
  }

  private async calculateAndStore(
    target: StockTarget,
  ): Promise<StockRecalculationResult> {
    const [shopsTotal, region, current] = await Promise.all([
      this.shopStockRepository.sumForRegion(target.variantId, target.regionId),
      this.regionRepository.findSafetyBuffer(target.regionId),
      this.ecomService.getCurrent(target.variantId, target.regionId),
    ]);

    const reservations = await this.readReservations(target, current);

    const result = this.calculateService.calculate({
      shopsTotal,
      safetyBuffer: region.safetyBuffer,
      reserved: reservations.reserved,
    });

    const publish = this.shouldPublish(result.quantity, reservations, current);

    await this.database.$transaction(async (tx) => {
      await this.ecomService.saveCalculated(
        target,
        result,
        reservations.stale,
        publish,
        tx,
      );

      if (publish) {
        await this.ecomService.enqueuePublication(target, result.quantity, tx);
      }

      if (!reservations.stale) {
        await this.taskRepository.markDone(target, tx);
      }
    });

    if (publish) {
      this.ecomService.publishSoon();
    }

    return {
      ...result,
      regionCode: target.regionCode,
      reservationsStale: reservations.stale,
      published: publish,
    };
  }

  /**
   * Asks e-com how much is reserved. When e-com cannot answer, the last known
   * value is carried over and the result is flagged stale — never treated as
   * zero, which would overstate stock.
   */
  private async readReservations(
    target: StockTarget,
    current: EcomStockSnapshot | null,
  ): Promise<{ reserved: number; stale: boolean }> {
    try {
      const reserved = await this.ecomApiService.getReservedQuantity({
        sku: target.sku,
        variantCode: target.variantCode,
        regionCode: target.regionCode,
      });

      return { reserved, stale: false };
    } catch (error) {
      if (!(error instanceof EcomApiUnavailableError)) {
        throw error;
      }

      this.logger.error(
        `[${StockRecalculateService.name}]Calculating ${target.sku}/${target.variantCode} in ${target.regionCode} without fresh reservations: ${error.message}`,
      );

      await this.taskRepository.recordUnavailableReservations(
        target,
        error.message,
        RECALCULATION.MAX_ATTEMPTS,
      );

      return { reserved: current?.reserved ?? 0, stale: true };
    }
  }

  /**
   * On confirmed reservations, always publish.
   *
   * On stale ones the number rests on a carried-over `reserved`, so it is only
   * published when it does not *raise* what e-com may sell: a drop in shop stock
   * still propagates (which is what protects against overselling), while an
   * increase waits for e-com to come back.
   *
   * The comparison is against `publishedQuantity` — the number e-com actually
   * holds — not against `quantity`, which by then may be a previously withheld
   * result. With nothing ever published there is no safe baseline, so the number
   * is withheld entirely.
   */
  private shouldPublish(
    quantity: number,
    reservations: { stale: boolean },
    current: EcomStockSnapshot | null,
  ): boolean {
    if (!reservations.stale) {
      return true;
    }

    if (current?.publishedQuantity === null || current === null) {
      return false;
    }

    return quantity <= current.publishedQuantity;
  }
}
