import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { RecalculationTaskStatus } from '../../generated/prisma/client';
import { TransactionClient } from '../../shared/database/types/database.type';
import { describeError, handleExceptionCode } from '../../shared/utils/utils';
import { ProductVariantRepository } from './repositories/product-variant.repository';
import { StockRecalculationTaskRepository } from './repositories/stock-recalculation-task.repository';
import { ProductStockResponseDto } from './response/stock.response.dto';
import { StockApplyCatalogueService } from './services/stock.apply-catalogue.service';
import { StockApplyStockService } from './services/stock.apply-stock.service';
import { StockReadService } from './services/stock.read.service';
import { StockRecalculateService } from './services/stock.recalculate.service';
import {
  ERecalculationReason,
  ProductCatalogueCommand,
  StockRecalculationResult,
  StockTarget,
  StockUpdateCommand,
} from './types/stock.type';

/**
 * Facade over the stock operations. Callers (the Kafka consumer and the REST
 * controller) talk only to this class.
 */
@Injectable()
export class StockService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly applyCatalogueService: StockApplyCatalogueService,
    private readonly applyStockService: StockApplyStockService,
    private readonly recalculateService: StockRecalculateService,
    private readonly readService: StockReadService,
    private readonly variantRepository: ProductVariantRepository,
    private readonly taskRepository: StockRecalculationTaskRepository,
  ) {}

  /**
   * Applies product master data. No recalculation follows: the catalogue message
   * carries no quantities, so nothing that feeds the formula has changed.
   */
  public async applyCatalogue(
    command: ProductCatalogueCommand,
    tx: TransactionClient,
  ): Promise<void> {
    try {
      await this.applyCatalogueService.apply(command, tx);
    } catch (error) {
      const errorMessage = `[${StockService.name}]Applying the catalogue for ${command.sku} was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);
      throw handleExceptionCode(error as Error, errorMessage);
    }
  }

  /**
   * Applies a stock message and registers every affected variant/region pair for
   * calculation.
   *
   * Runs in the caller's transaction. The calculation itself is deliberately not
   * part of it — it needs an HTTP call to e-com — so what commits here is "the
   * stock changed and owes a recalculation".
   */
  public async applyStock(
    command: StockUpdateCommand,
    tx: TransactionClient,
  ): Promise<StockTarget[]> {
    try {
      const targets = await this.applyStockService.apply(command, tx);

      for (const target of targets) {
        await this.taskRepository.enqueue(
          target,
          ERecalculationReason.BcStock,
          tx,
        );
      }

      return targets;
    } catch (error) {
      const errorMessage = `[${StockService.name}]Applying stock for ${command.sku} was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);
      throw handleExceptionCode(error as Error, errorMessage);
    }
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
  public async tryRecalculate(targets: StockTarget[]): Promise<void> {
    for (const target of targets) {
      try {
        await this.recalculateService.run(target);
      } catch (error) {
        // Swallowed on purpose: the recalculation task is already committed, so
        // the retry worker owns this pair. Rethrowing would park a BC event whose
        // stock was applied correctly.
        this.logger.error(
          `[${StockService.name}]Deferring calculation of ${target.sku}/${target.variantCode} in ${target.regionCode}` +
            ` with error: ${describeError(error)}`,
        );
      }
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
    try {
      return await this.runRecalculationForVariant(sku, variantCode);
    } catch (error) {
      const errorMessage = `[${StockService.name}]Recalculating ${sku}/${variantCode} was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);
      throw handleExceptionCode(error as Error, errorMessage);
    }
  }

  private async runRecalculationForVariant(
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
