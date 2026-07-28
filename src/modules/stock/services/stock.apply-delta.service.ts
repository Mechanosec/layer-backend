import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { TransactionClient } from '../../../shared/database/types/database.type';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { ProductRepository } from '../repositories/product.repository';
import { ShopStockRepository } from '../repositories/shop-stock.repository';
import { StockDeltaCommand, StockTarget } from '../types/stock.type';
import { StockShopResolverService } from './stock.shop-resolver.service';

/**
 * Applies an incremental change. A delta for a variant we have never seen is
 * still applied, against a placeholder product — dropping it would leave us
 * silently out of step with BC until the next full snapshot.
 */
@Injectable()
export class StockApplyDeltaService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly productRepository: ProductRepository,
    private readonly variantRepository: ProductVariantRepository,
    private readonly shopStockRepository: ShopStockRepository,
    private readonly shopResolver: StockShopResolverService,
  ) {}

  public async apply(
    command: StockDeltaCommand,
    tx: TransactionClient,
  ): Promise<StockTarget> {
    const variantId = await this.resolveVariantId(command, tx);
    const shop = await this.shopResolver.resolve(command.shopCode, tx);

    const current = await this.shopStockRepository.findQuantity(
      variantId,
      shop.code,
      tx,
    );
    const next = (current ?? 0) + command.quantityDelta;

    if (next < 0) {
      this.logger.warn(
        `[${StockApplyDeltaService.name}]Delta ${command.quantityDelta} would take ${command.sku}/${command.variantCode} at shop ${shop.code} to ${next}; clamping to 0`,
      );
    }

    await this.shopStockRepository.setQuantity(
      variantId,
      shop.code,
      Math.max(0, next),
      tx,
    );

    return {
      variantId,
      sku: command.sku,
      variantCode: command.variantCode,
      regionId: shop.regionId,
      regionCode: shop.regionCode,
    };
  }

  private async resolveVariantId(
    command: StockDeltaCommand,
    tx: TransactionClient,
  ): Promise<string> {
    const existing = await this.variantRepository.findId(
      command.sku,
      command.variantCode,
      tx,
    );

    if (existing) {
      return existing.id;
    }

    this.logger.warn(
      `[${StockApplyDeltaService.name}]Unit event for unknown variant ${command.sku}/${command.variantCode}; creating a placeholder until the next snapshot`,
    );

    await this.productRepository.ensureExists(command.sku, tx);
    const created = await this.variantRepository.create(
      {
        sku: command.sku,
        variantCode: command.variantCode,
        unitMeasure: command.unitMeasure,
      },
      tx,
    );

    return created.id;
  }
}
