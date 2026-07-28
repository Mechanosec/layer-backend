import { Injectable } from '@nestjs/common';

import { ShopStock } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';

@Injectable()
export class ShopStockRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  public async findQuantity(
    variantId: string,
    shopCode: string,
    tx?: TransactionClient,
  ): Promise<number | null> {
    const stock = await this.client(tx).shopStock.findUnique({
      where: { variantId_shopCode: { variantId, shopCode } },
      select: { quantity: true },
    });

    return stock?.quantity ?? null;
  }

  public async setQuantity(
    variantId: string,
    shopCode: string,
    quantity: number,
    tx?: TransactionClient,
  ): Promise<ShopStock> {
    const reportedAt = new Date();

    return this.client(tx).shopStock.upsert({
      where: { variantId_shopCode: { variantId, shopCode } },
      create: { variantId, shopCode, quantity, reportedAt },
      update: { quantity, reportedAt },
    });
  }

  /**
   * Applies a signed change in one statement, so two concurrent deltas for the
   * same pair cannot lose each other the way a read-then-write would. The clamp
   * is a second statement: `increment` cannot express GREATEST(0, ...).
   */
  public async adjustQuantity(
    variantId: string,
    shopCode: string,
    delta: number,
    tx?: TransactionClient,
  ): Promise<void> {
    const client = this.client(tx);
    const reportedAt = new Date();

    await client.shopStock.upsert({
      where: { variantId_shopCode: { variantId, shopCode } },
      create: { variantId, shopCode, quantity: Math.max(0, delta), reportedAt },
      update: { quantity: { increment: delta }, reportedAt },
    });

    await client.shopStock.updateMany({
      where: { variantId, shopCode, quantity: { lt: 0 } },
      data: { quantity: 0 },
    });
  }

  /** Total held by the shops of a region that feed e-com. */
  public async sumForRegion(
    variantId: string,
    regionId: string,
    tx?: TransactionClient,
  ): Promise<number> {
    const result = await this.client(tx).shopStock.aggregate({
      _sum: { quantity: true },
      where: { variantId, shop: { regionId, includedInEcom: true } },
    });

    return result._sum.quantity ?? 0;
  }
}
