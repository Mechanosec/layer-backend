import { Injectable } from '@nestjs/common';

import { TransactionClient } from '../../../shared/database/types/database.type';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { ProductRepository } from '../repositories/product.repository';
import { ShopStockRepository } from '../repositories/shop-stock.repository';
import { StockSnapshotCommand, StockTarget } from '../types/stock.type';
import { StockShopResolverService } from './stock.shop-resolver.service';

/**
 * Applies a full snapshot. BC states the absolute stock of a variant in a shop,
 * so the stored quantity is replaced rather than adjusted.
 */
@Injectable()
export class StockApplySnapshotService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly variantRepository: ProductVariantRepository,
    private readonly shopStockRepository: ShopStockRepository,
    private readonly shopResolver: StockShopResolverService,
  ) {}

  public async apply(
    command: StockSnapshotCommand,
    tx: TransactionClient,
  ): Promise<StockTarget> {
    await this.productRepository.upsertAttributes(
      {
        sku: command.sku,
        name: command.name,
        category: command.category,
        brand: command.brand,
      },
      tx,
    );

    const variant = await this.variantRepository.upsertFromSnapshot(
      command,
      tx,
    );
    const shop = await this.shopResolver.resolve(command.shopCode, tx);

    await this.shopStockRepository.setQuantity(
      variant.id,
      shop.code,
      Math.max(0, command.quantity),
      tx,
    );

    return {
      variantId: variant.id,
      sku: command.sku,
      variantCode: command.variantCode,
      regionId: shop.regionId,
      regionCode: shop.regionCode,
    };
  }
}
