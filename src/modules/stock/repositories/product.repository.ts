import { Injectable } from '@nestjs/common';

import { Product } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';

@Injectable()
export class ProductRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  public async upsertAttributes(
    data: { sku: string; name: string; category?: string; brand?: string },
    tx?: TransactionClient,
  ): Promise<Product> {
    const { sku, ...attributes } = data;

    return this.client(tx).product.upsert({
      where: { sku },
      create: { sku, ...attributes },
      update: attributes,
    });
  }

  /** Placeholder for a SKU seen in a delta before any snapshot described it. */
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
        variants: {
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
