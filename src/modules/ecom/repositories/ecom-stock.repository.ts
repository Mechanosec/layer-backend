import { Injectable } from '@nestjs/common';

import { EcomStock } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';
import { EcomStockTarget, EcomStockValue } from '../types/ecom.type';

@Injectable()
export class EcomStockRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  /** The number e-com was last told, and the reservations behind it. */
  public async findCurrent(
    variantId: string,
    regionId: string,
    tx?: TransactionClient,
  ): Promise<Pick<
    EcomStock,
    | 'quantity'
    | 'reserved'
    | 'reservationsStale'
    | 'publishedQuantity'
    | 'publishedAt'
  > | null> {
    return this.client(tx).ecomStock.findUnique({
      where: { variantId_regionId: { variantId, regionId } },
      select: {
        quantity: true,
        reserved: true,
        reservationsStale: true,
        publishedQuantity: true,
        publishedAt: true,
      },
    });
  }

  /**
   * One row per variant/region.
   *
   * `publishedQuantity` is only touched when the number is actually being handed
   * to e-com, so a withheld result cannot destroy the baseline that later stale
   * results are compared against.
   */
  public async upsert(
    target: EcomStockTarget,
    value: EcomStockValue,
    reservationsStale: boolean,
    published: boolean,
    tx?: TransactionClient,
  ): Promise<EcomStock> {
    const calculatedAt = new Date();
    const publication = published
      ? { publishedQuantity: value.quantity, publishedAt: null }
      : {};

    return this.client(tx).ecomStock.upsert({
      where: {
        variantId_regionId: {
          variantId: target.variantId,
          regionId: target.regionId,
        },
      },
      create: {
        variantId: target.variantId,
        regionId: target.regionId,
        ...value,
        reservationsStale,
        calculatedAt,
        ...publication,
      },
      update: {
        ...value,
        reservationsStale,
        calculatedAt,
        ...publication,
      },
    });
  }

  /**
   * Stamps delivery on exactly the pairs that were delivered.
   *
   * Scoped by region on purpose: filtering on `variantId` alone would mark a
   * variant's other regions as delivered too, including ones whose stale result
   * was deliberately withheld — destroying the one signal that a region is behind.
   */
  public async markPublished(
    pairs: { variantId: string; regionId: string }[],
    publishedAt: Date,
    tx?: TransactionClient,
  ): Promise<number> {
    if (pairs.length === 0) {
      return 0;
    }

    const { count } = await this.client(tx).ecomStock.updateMany({
      where: { OR: pairs },
      data: { publishedAt },
    });

    return count;
  }

  public async countStale(tx?: TransactionClient): Promise<number> {
    return this.client(tx).ecomStock.count({
      where: { reservationsStale: true },
    });
  }
}
