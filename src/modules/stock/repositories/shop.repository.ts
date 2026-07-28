import { Injectable } from '@nestjs/common';

import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';
import { ResolvedShop } from '../types/stock.type';

const SHOP_WITH_REGION = {
  code: true,
  regionId: true,
  region: { select: { bcCode: true } },
} as const;

@Injectable()
export class ShopRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  public async findByCode(
    code: string,
    tx?: TransactionClient,
  ): Promise<ResolvedShop | null> {
    const shop = await this.client(tx).shop.findUnique({
      where: { code },
      select: SHOP_WITH_REGION,
    });

    return shop
      ? {
          code: shop.code,
          regionId: shop.regionId,
          regionCode: shop.region.bcCode,
        }
      : null;
  }

  public async create(
    data: { code: string; regionId: string },
    tx?: TransactionClient,
  ): Promise<ResolvedShop> {
    const shop = await this.client(tx).shop.create({
      data,
      select: SHOP_WITH_REGION,
    });

    return {
      code: shop.code,
      regionId: shop.regionId,
      regionCode: shop.region.bcCode,
    };
  }
}
