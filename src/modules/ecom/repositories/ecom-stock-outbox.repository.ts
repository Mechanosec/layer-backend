import { Injectable } from '@nestjs/common';

import {
  EcomStockOutbox,
  OutboxStatus,
} from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';
import { EcomStockTarget } from '../types/ecom.type';

@Injectable()
export class EcomStockOutboxRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  public async enqueue(
    target: EcomStockTarget,
    quantity: number,
    tx?: TransactionClient,
  ): Promise<EcomStockOutbox> {
    return this.client(tx).ecomStockOutbox.create({
      data: {
        sku: target.sku,
        variantCode: target.variantCode,
        variantId: target.variantId,
        regionId: target.regionId,
        regionCode: target.regionCode,
        quantity,
      },
    });
  }

  public async findPending(
    take: number,
    tx?: TransactionClient,
  ): Promise<EcomStockOutbox[]> {
    return this.client(tx).ecomStockOutbox.findMany({
      where: { status: OutboxStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take,
    });
  }

  public async markSent(
    ids: string[],
    sentAt: Date,
    tx?: TransactionClient,
  ): Promise<number> {
    const { count } = await this.client(tx).ecomStockOutbox.updateMany({
      where: { id: { in: ids } },
      data: { status: OutboxStatus.SENT, sentAt, lastError: null },
    });

    return count;
  }

  /** Leaves the rows PENDING so the next tick retries them. */
  public async recordFailure(
    ids: string[],
    error: string,
    tx?: TransactionClient,
  ): Promise<number> {
    const { count } = await this.client(tx).ecomStockOutbox.updateMany({
      where: { id: { in: ids } },
      data: { attempts: { increment: 1 }, lastError: error },
    });

    return count;
  }
}
