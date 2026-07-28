import { Injectable } from '@nestjs/common';

import { ProductRepository } from '../repositories/product.repository';
import { ProductStockResponseDto } from '../response/stock.response.dto';

/** Read model behind GET /stock/:sku. */
@Injectable()
export class StockReadService {
  constructor(private readonly productRepository: ProductRepository) {}

  public async getBySku(sku: string): Promise<ProductStockResponseDto> {
    const product = await this.productRepository.findWithStockBySku(sku);

    return {
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      unitMeasure: product.unitMeasure,
      price: product.price?.toString() ?? null,
      division: product.division,
      category: product.category,
      retailProductCode: product.retailProductCode,
      customCategoryCode: product.customCategoryCode,
      customCategoryCodeDescription: product.customCategoryCodeDescription,
      season: product.season
        ? {
            name: product.season.name,
            startsAt: product.season.startsAt,
            endsAt: product.season.endsAt,
          }
        : null,
      variants: product.variants.map((variant) => ({
        variantCode: variant.variantCode,
        barcodeNo: variant.barcodeNo,
        color: variant.color,
        size: variant.size,
        // Falls back to the catalogue price when the stock message did not carry one.
        price: (variant.price ?? product.price)?.toString() ?? null,
        shops: variant.stocks.map((stock) => ({
          shopCode: stock.shopCode,
          shopName: stock.shop.name,
          includedInEcom: stock.shop.includedInEcom,
          quantity: stock.quantity,
          reportedAt: stock.reportedAt,
        })),
        ecom: variant.ecomStocks.map((ecom) => ({
          regionCode: ecom.region.bcCode,
          regionName: ecom.region.name,
          quantity: ecom.quantity,
          shopsTotal: ecom.shopsTotal,
          safetyBuffer: ecom.safetyBuffer,
          reserved: ecom.reserved,
          reservationsStale: ecom.reservationsStale,
          publishedQuantity: ecom.publishedQuantity,
          calculatedAt: ecom.calculatedAt,
          publishedAt: ecom.publishedAt,
        })),
      })),
    };
  }
}
