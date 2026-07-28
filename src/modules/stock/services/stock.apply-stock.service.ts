import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { TransactionClient } from '../../../shared/database/types/database.type';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { ProductRepository } from '../repositories/product.repository';
import { ShopStockRepository } from '../repositories/shop-stock.repository';
import {
  StockLine,
  StockTarget,
  StockUpdateCommand,
} from '../types/stock.type';
import { StockShopResolverService } from './stock.shop-resolver.service';

/**
 * Applies a stock message: one line per variant/warehouse pair.
 *
 * A line carries either an absolute `quantity` or a signed `quantityDelta` —
 * Business Central has not decided which it will send, so both are handled. The
 * difference matters: an absolute value is idempotent on replay, a delta is not,
 * which is why the inbox guard in bc-events is not optional.
 */
@Injectable()
export class StockApplyStockService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly productRepository: ProductRepository,
    private readonly variantRepository: ProductVariantRepository,
    private readonly shopStockRepository: ShopStockRepository,
    private readonly shopResolver: StockShopResolverService,
  ) {}

  /**
   * Returns one target per affected variant/region pair, deduplicated: a message
   * touching four warehouses of the same region needs one recalculation, not four.
   */
  public async apply(
    command: StockUpdateCommand,
    tx: TransactionClient,
  ): Promise<StockTarget[]> {
    await this.productRepository.ensureExists(command.sku, tx);

    const targets = new Map<string, StockTarget>();

    for (const line of command.lines) {
      const target = await this.applyLine(command.sku, line, tx);
      targets.set(`${target.variantId}:${target.regionId}`, target);
    }

    return [...targets.values()];
  }

  private async applyLine(
    sku: string,
    line: StockLine,
    tx: TransactionClient,
  ): Promise<StockTarget> {
    const variant = await this.variantRepository.ensureForStock(
      sku,
      line.variantCode,
      { barcodeNo: line.barcodeNo, price: line.price },
      tx,
    );
    const shop = await this.shopResolver.resolve(line.shopCode, tx);

    const quantity = await this.resolveQuantity(
      sku,
      variant.id,
      shop.code,
      line,
      tx,
    );

    await this.shopStockRepository.setQuantity(
      variant.id,
      shop.code,
      quantity,
      tx,
    );

    return {
      variantId: variant.id,
      sku,
      variantCode: line.variantCode,
      regionId: shop.regionId,
      regionCode: shop.regionCode,
    };
  }

  private async resolveQuantity(
    sku: string,
    variantId: string,
    shopCode: string,
    line: StockLine,
    tx: TransactionClient,
  ): Promise<number> {
    if (line.quantity !== undefined) {
      if (line.quantity < 0) {
        this.logger.warn(
          `[${StockApplyStockService.name}]BC reported a negative stock of ${line.quantity} for ${sku}/${line.variantCode} at ${shopCode}; clamping to 0`,
        );
      }

      return Math.max(0, line.quantity);
    }

    const current =
      (await this.shopStockRepository.findQuantity(variantId, shopCode, tx)) ??
      0;
    const next = current + (line.quantityDelta ?? 0);

    if (next < 0) {
      this.logger.warn(
        `[${StockApplyStockService.name}]Delta ${line.quantityDelta} would take ${sku}/${line.variantCode} at ${shopCode} to ${next}; clamping to 0`,
      );
    }

    return Math.max(0, next);
  }
}
