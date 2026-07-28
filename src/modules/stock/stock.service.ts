import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { RecalculationTaskStatus } from '../../generated/prisma/client';
import { TransactionClient } from '../../shared/database/types/database.type';
import { ProductVariantRepository } from './repositories/product-variant.repository';
import { StockRecalculationTaskRepository } from './repositories/stock-recalculation-task.repository';
import { ProductStockResponseDto } from './response/stock.response.dto';
import { StockApplyDeltaService } from './services/stock.apply-delta.service';
import { StockApplySnapshotService } from './services/stock.apply-snapshot.service';
import { StockReadService } from './services/stock.read.service';
import { StockRecalculateService } from './services/stock.recalculate.service';
import {
  ERecalculationReason,
  StockDeltaCommand,
  StockRecalculationResult,
  StockSnapshotCommand,
  StockTarget,
} from './types/stock.type';

/**
 * Facade over the stock operations. Callers (the Kafka consumer and the REST
 * controller) talk only to this class.
 */
@Injectable()
export class StockService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly applySnapshotService: StockApplySnapshotService,
    private readonly applyDeltaService: StockApplyDeltaService,
    private readonly recalculateService: StockRecalculateService,
    private readonly readService: StockReadService,
    private readonly variantRepository: ProductVariantRepository,
    private readonly taskRepository: StockRecalculationTaskRepository,
  ) {}

  /**
   * Applies a BC snapshot and registers the affected pair for calculation.
   *
   * Runs in the caller's transaction. The calculation itself is deliberately not
   * part of it — it needs an HTTP call to e-com — so what commits here is "the
   * stock changed and owes a recalculation".
   */
  public async applySnapshot(
    command: StockSnapshotCommand,
    tx: TransactionClient,
  ): Promise<StockTarget> {
    const target = await this.applySnapshotService.apply(command, tx);
    await this.taskRepository.enqueue(
      target,
      ERecalculationReason.BcSnapshot,
      tx,
    );

    return target;
  }

  public async applyDelta(
    command: StockDeltaCommand,
    tx: TransactionClient,
  ): Promise<StockTarget> {
    const target = await this.applyDeltaService.apply(command, tx);
    await this.taskRepository.enqueue(target, ERecalculationReason.BcDelta, tx);

    return target;
  }

  /**
   * Runs the pending calculation for a pair. Safe to call outside a transaction —
   * and it has to be, because it queries e-com.
   */
  public async recalculate(
    target: StockTarget,
  ): Promise<StockRecalculationResult> {
    return this.recalculateService.run(target);
  }

  /**
   * Best-effort recalculation for the ingest path: a failure here is already
   * recorded as a pending task, so the retry worker will pick it up rather than
   * the BC event being marked failed and replayed.
   */
  public async tryRecalculate(target: StockTarget): Promise<void> {
    try {
      await this.recalculateService.run(target);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);

      this.logger.error(
        `[${StockService.name}]Deferring calculation of ${target.sku}/${target.variantCode} in ${target.regionCode} after error: ${message}`,
      );
    }
  }

  /**
   * Recalculates every region the variant holds stock in. Used after a region's
   * safety buffer or shop selection changes, where no BC event will arrive.
   */
  public async recalculateVariant(
    sku: string,
    variantCode: string,
  ): Promise<StockRecalculationResult[]> {
    const variant = await this.variantRepository.findWithRegions(
      sku,
      variantCode,
    );

    const regions = new Map<string, string>();
    for (const stock of variant.stocks) {
      regions.set(stock.shop.regionId, stock.shop.region.bcCode);
    }

    const results: StockRecalculationResult[] = [];
    for (const [regionId, regionCode] of regions) {
      const target: StockTarget = {
        variantId: variant.id,
        sku: variant.sku,
        variantCode: variant.variantCode,
        regionId,
        regionCode,
      };

      await this.taskRepository.enqueue(
        target,
        ERecalculationReason.ManualRequest,
      );
      results.push(await this.recalculateService.run(target));
    }

    return results;
  }

  public async getBySku(sku: string): Promise<ProductStockResponseDto> {
    return this.readService.getBySku(sku);
  }

  /** Backlog of calculations that could not be completed, for /health. */
  public async countBlockedCalculations(): Promise<{
    pending: number;
    abandoned: number;
  }> {
    const [pending, abandoned] = await Promise.all([
      this.taskRepository.countByStatus(RecalculationTaskStatus.PENDING),
      this.taskRepository.countByStatus(RecalculationTaskStatus.ABANDONED),
    ]);

    return { pending, abandoned };
  }
}
