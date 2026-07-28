import { Injectable } from '@nestjs/common';

import { ProductVariant } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';
import { ProductVariantDescriptor } from '../types/stock.type';

@Injectable()
export class ProductVariantRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  /** Applies one variant from the catalogue message. */
  public async upsertFromCatalogue(
    sku: string,
    descriptor: ProductVariantDescriptor,
    tx?: TransactionClient,
  ): Promise<Pick<ProductVariant, 'id'>> {
    const attributes = {
      barcodeNo: descriptor.barcodeNo,
      color: descriptor.color,
      size: descriptor.size,
    };

    return this.client(tx).productVariant.upsert({
      where: {
        sku_variantCode: { sku, variantCode: descriptor.variantCode },
      },
      create: { sku, variantCode: descriptor.variantCode, ...attributes },
      update: attributes,
      select: { id: true },
    });
  }

  /**
   * Ensures the variant a stock line refers to exists, and nothing more.
   *
   * A stock message must not write master data. It carries `barcodeNo` and
   * `price`, but the catalogue message owns both: writing `barcodeNo` from here
   * would give a unique column a second writer, and a collision would roll back
   * the whole message — freezing that SKU's quantities over a data-quality
   * wobble. The price would likewise race the catalogue with no ordering.
   */
  public async ensureForStock(
    sku: string,
    variantCode: string,
    tx?: TransactionClient,
  ): Promise<Pick<ProductVariant, 'id'>> {
    return this.client(tx).productVariant.upsert({
      where: { sku_variantCode: { sku, variantCode } },
      create: { sku, variantCode },
      update: {},
      select: { id: true },
    });
  }

  public async findId(
    sku: string,
    variantCode: string,
    tx?: TransactionClient,
  ): Promise<Pick<ProductVariant, 'id'> | null> {
    return this.client(tx).productVariant.findUnique({
      where: { sku_variantCode: { sku, variantCode } },
      select: { id: true },
    });
  }

  /** Variant plus the regions it currently holds stock in, for a full recalculation. */
  public async findWithRegions(
    sku: string,
    variantCode: string,
    tx?: TransactionClient,
  ) {
    return this.client(tx).productVariant.findUniqueOrThrow({
      where: { sku_variantCode: { sku, variantCode } },
      select: {
        id: true,
        sku: true,
        variantCode: true,
        stocks: {
          select: {
            shop: {
              select: { regionId: true, region: { select: { bcCode: true } } },
            },
          },
        },
      },
    });
  }
}
