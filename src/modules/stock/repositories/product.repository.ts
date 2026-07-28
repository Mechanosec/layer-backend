import { Injectable } from '@nestjs/common';

import { Prisma, Product } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';
import { ProductCatalogueCommand } from '../types/stock.type';

@Injectable()
export class ProductRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  /** Applies the catalogue message's product-level attributes. */
  public async upsertFromCatalogue(
    command: ProductCatalogueCommand,
    seasonId: string | undefined,
    tx?: TransactionClient,
  ): Promise<Product> {
    const attributes = {
      name: command.name,
      brand: command.brand,
      unitMeasure: command.unitMeasure,
      price:
        command.price === undefined
          ? undefined
          : new Prisma.Decimal(command.price),
      division: command.division,
      category: command.category,
      retailProductCode: command.retailProductCode,
      customCategoryCode: command.customCategoryCode,
      customCategoryCodeDescription: command.customCategoryCodeDescription,
      seasonId,
    };

    return this.client(tx).product.upsert({
      where: { sku: command.sku },
      create: { sku: command.sku, ...attributes },
      update: attributes,
    });
  }

  /**
   * Placeholder for a SKU seen on a stock message before any catalogue message
   * described it. Dropping the stock would leave us out of step with BC until the
   * catalogue arrives.
   */
  public async ensureExists(
    sku: string,
    tx?: TransactionClient,
  ): Promise<Product> {
    return this.client(tx).product.upsert({
      where: { sku },
      create: { sku, name: sku },
      update: {},
    });
  }

  public async findWithStockBySku(sku: string, tx?: TransactionClient) {
    return this.client(tx).product.findUniqueOrThrow({
      where: { sku },
      include: {
        season: { select: { name: true, startsAt: true, endsAt: true } },
        variants: {
          orderBy: { variantCode: 'asc' },
          include: {
            stocks: {
              include: {
                shop: {
                  select: { code: true, name: true, includedInEcom: true },
                },
              },
            },
            ecomStocks: {
              include: { region: { select: { bcCode: true, name: true } } },
            },
          },
        },
      },
    });
  }
}
