import { Injectable } from '@nestjs/common';

import {
  BcEvent,
  EcomStockOutbox,
  RecalculationTaskStatus,
  StockRecalculationTask,
} from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';

/**
 * Read-only queries for the pipeline view. Reaches across the tables the other
 * modules own on purpose: this module exists to explain the whole flow, and
 * routing every read through five facades would obscure rather than protect.
 */
@Injectable()
export class PipelineRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  public async findVariantWithStock(sku: string, variantCode: string) {
    return this.database.productVariant.findUnique({
      where: { sku_variantCode: { sku, variantCode } },
      include: {
        product: { select: { name: true, category: true, brand: true } },
        stocks: {
          orderBy: { shopCode: 'asc' },
          include: {
            shop: {
              select: {
                code: true,
                name: true,
                includedInEcom: true,
                region: {
                  select: { bcCode: true, name: true, safetyBuffer: true },
                },
              },
            },
          },
        },
        ecomStocks: {
          include: { region: { select: { bcCode: true, name: true } } },
        },
      },
    });
  }

  public async findEventsForSku(sku: string, take: number): Promise<BcEvent[]> {
    return this.database.bcEvent.findMany({
      where: { key: { startsWith: `${sku}:` } },
      orderBy: { receivedAt: 'desc' },
      take,
    });
  }

  public async findRecentEvents(take: number): Promise<BcEvent[]> {
    return this.database.bcEvent.findMany({
      orderBy: { receivedAt: 'desc' },
      take,
    });
  }

  public async findOutboxForSku(
    sku: string,
    take: number,
  ): Promise<EcomStockOutbox[]> {
    return this.database.ecomStockOutbox.findMany({
      where: { sku },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  public async findRecentOutbox(take: number): Promise<EcomStockOutbox[]> {
    return this.database.ecomStockOutbox.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  public async findTasksForVariant(
    variantId: string,
  ): Promise<StockRecalculationTask[]> {
    return this.database.stockRecalculationTask.findMany({
      where: {
        variantId,
        status: { not: RecalculationTaskStatus.DONE },
      },
    });
  }

  /** Every SKU the service has heard about, for the picker. */
  public async findKnownVariants(take: number) {
    return this.database.productVariant.findMany({
      orderBy: [{ sku: 'asc' }, { variantCode: 'asc' }],
      take,
      select: {
        sku: true,
        variantCode: true,
        metadata: true,
        product: { select: { name: true } },
      },
    });
  }

  /** Shops available on the demo stand, so the UI never invents a code. */
  public async findShops() {
    return this.database.shop.findMany({
      orderBy: { code: 'asc' },
      select: {
        code: true,
        name: true,
        includedInEcom: true,
        region: { select: { bcCode: true, name: true, safetyBuffer: true } },
      },
    });
  }
}
