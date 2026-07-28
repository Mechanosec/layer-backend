import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { TransactionClient } from '../../../shared/database/types/database.type';
import {
  DEFAULT_SAFETY_BUFFER,
  UNASSIGNED_REGION_CODE,
  UNASSIGNED_REGION_NAME,
} from '../constants/stock.constants';
import { RegionRepository } from '../repositories/region.repository';
import { ShopRepository } from '../repositories/shop.repository';
import { ResolvedShop } from '../types/stock.type';

/**
 * Business Central events carry a bare `shopCode`. Shops the service has not
 * seen before are created on the spot and parked in the UNASSIGNED region, so an
 * unmapped shop delays e-com visibility instead of dropping the event.
 */
@Injectable()
export class StockShopResolverService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly shopRepository: ShopRepository,
    private readonly regionRepository: RegionRepository,
  ) {}

  public async resolve(
    shopCode: string,
    tx: TransactionClient,
  ): Promise<ResolvedShop> {
    const existing = await this.shopRepository.findByCode(shopCode, tx);
    if (existing) {
      return existing;
    }

    const region = await this.regionRepository.ensureByCode(
      {
        bcCode: UNASSIGNED_REGION_CODE,
        name: UNASSIGNED_REGION_NAME,
        safetyBuffer: DEFAULT_SAFETY_BUFFER,
      },
      tx,
    );

    this.logger.warn(
      `[${StockShopResolverService.name}]Unknown shop ${shopCode}; created it in region ${region.bcCode}`,
    );

    return this.shopRepository.create(
      { code: shopCode, regionId: region.id },
      tx,
    );
  }
}
