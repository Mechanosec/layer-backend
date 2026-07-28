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

  /**
   * Creates a shop BC has named but nobody has mapped yet.
   *
   * `includedInEcom: false` on purpose: an unmapped warehouse must not have its
   * stock published under the placeholder region. Failing closed means the stock
   * waits for someone to map the shop, instead of being offered for sale under a
   * region e-com has never heard of.
   *
   * An upsert rather than a create because two messages naming the same unknown
   * warehouse would otherwise collide and both be parked as failed.
   */
  public async ensureUnmapped(
    data: { code: string; regionId: string },
    tx?: TransactionClient,
  ): Promise<ResolvedShop> {
    const shop = await this.client(tx).shop.upsert({
      where: { code: data.code },
      create: { ...data, includedInEcom: false },
      update: {},
      select: SHOP_WITH_REGION,
    });

    return {
      code: shop.code,
      regionId: shop.regionId,
      regionCode: shop.region.bcCode,
    };
  }
}
