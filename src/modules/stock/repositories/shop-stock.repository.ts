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
