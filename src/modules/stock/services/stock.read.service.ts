import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { HttpCodeStockException } from '../../../shared/constants/http-exception-code.constant';
import { Prisma } from '../../../generated/prisma/client';
import {
  describeError,
  handleExceptionCode,
} from '../../../shared/utils/utils';
import { ProductRepository } from '../repositories/product.repository';
import { ProductStockResponseDto } from '../response/stock.response.dto';

/** Read model behind GET /stock/:sku. */
@Injectable()
export class StockReadService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly productRepository: ProductRepository,
  ) {}

  public async getBySku(sku: string): Promise<ProductStockResponseDto> {
    try {
      return await this.read(sku);
    } catch (error) {
      // A SKU nobody has sent yet is an ordinary answer, not a failure: the
      // visualiser distinguishes 404 from a real error, so keep the status.
      if (isRecordNotFound(error)) {
        throw new NotFoundException({
          message: `Business Central has not sent anything about ${sku} yet`,
          code: HttpCodeStockException.STOCK_PRODUCT_NOT_FOUND,
        });
      }

      const errorMessage = `[${StockReadService.name}]Reading stock for ${sku} was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);
      throw handleExceptionCode(error as Error, errorMessage);
    }
  }

  private async read(sku: string): Promise<ProductStockResponseDto> {
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
        // The catalogue message owns the price; a stock message never writes it.
        price: product.price?.toString() ?? null,
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

/** Prisma's "no row matched" from `findUniqueOrThrow`. */
function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}
