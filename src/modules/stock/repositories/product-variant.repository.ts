import { Injectable } from '@nestjs/common';

import { Prisma, ProductVariant } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';
import { StockSnapshotCommand } from '../types/stock.type';

@Injectable()
export class ProductVariantRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  public async upsertFromSnapshot(
    command: StockSnapshotCommand,
    tx?: TransactionClient,
  ): Promise<Pick<ProductVariant, 'id'>> {
    const attributes = {
      metadata: command.metadata,
      unitMeasure: command.unitMeasure,
      // BC sends the price as a string; Decimal keeps it exact.
      price:
        command.price === undefined
          ? undefined
          : new Prisma.Decimal(command.price),
      customCategoryCode: command.customCategoryCode,
      customCategoryCodeDescription: command.customCategoryCodeDescription,
    };

    return this.client(tx).productVariant.upsert({
      where: {
        sku_variantCode: { sku: command.sku, variantCode: command.variantCode },
      },
      create: {
        sku: command.sku,
        variantCode: command.variantCode,
        ...attributes,
      },
      update: attributes,
      select: { id: true },
    });
  }

  public async findId(
    sku: string,
    variantCode: string,
    tx?: TransactionClient,
  ): Promise<Pick<ProductVariant, 'id'> | null> {
    return this.client(tx).productVariant.findUnique({
      where: { sku_variantCode: { sku, variantCode } },
      select: { id: true },
    });
  }

  public async create(
    data: { sku: string; variantCode: string; unitMeasure?: string },
    tx?: TransactionClient,
  ): Promise<Pick<ProductVariant, 'id'>> {
    return this.client(tx).productVariant.create({
      data,
      select: { id: true },
    });
  }

  /** Variant plus the regions it currently holds stock in, for a full recalculation. */
  public async findWithRegions(
    sku: string,
    variantCode: string,
    tx?: TransactionClient,
  ) {
    return this.client(tx).productVariant.findUniqueOrThrow({
      where: { sku_variantCode: { sku, variantCode } },
      select: {
        id: true,
        sku: true,
        variantCode: true,
        stocks: {
          select: {
            shop: {
              select: { regionId: true, region: { select: { bcCode: true } } },
            },
          },
        },
      },
    });
  }
}
