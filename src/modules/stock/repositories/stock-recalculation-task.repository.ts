import { Injectable } from '@nestjs/common';

import {
  RecalculationTaskStatus,
  StockRecalculationTask,
} from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';
import { ERecalculationReason, StockTarget } from '../types/stock.type';

@Injectable()
export class StockRecalculationTaskRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  /**
   * Marks a variant/region pair as needing calculation.
   *
   * One row per pair, so a burst of events for the same variant coalesces into a
   * single outstanding calculation instead of queueing ten of them.
   *
   * The attempt count is **not** reset by ordinary BC traffic. Resetting it there
   * means any variant BC touches more often than the retry interval never reaches
   * MAX_ATTEMPTS, never abandons, and never shows up as degraded — so the busiest
   * SKUs would be exactly the ones that stay silently stale through an e-com
   * outage. Only an explicit manual request clears it.
   */
  public async enqueue(
    target: StockTarget,
    reason: ERecalculationReason,
    tx?: TransactionClient,
  ): Promise<StockRecalculationTask> {
    const isManual = reason === ERecalculationReason.ManualRequest;

    return this.client(tx).stockRecalculationTask.upsert({
      where: this.identity(target),
      create: { ...this.identityFields(target), reason },
      update: {
        reason,
        status: RecalculationTaskStatus.PENDING,
        ...(isManual ? { attempts: 0, lastError: null } : {}),
      },
    });
  }

  /**
   * Records that a run could not read reservations from e-com. Keeps the pair
   * PENDING and counts the attempt; past `maxAttempts` the pair is ABANDONED so
   * the worker stops burning requests and the backlog surfaces the problem.
   */
  public async recordUnavailableReservations(
    target: StockTarget,
    error: string,
    maxAttempts: number,
    tx?: TransactionClient,
  ): Promise<StockRecalculationTask> {
    const client = this.client(tx);

    const task = await client.stockRecalculationTask.upsert({
      where: this.identity(target),
      create: {
        ...this.identityFields(target),
        reason: ERecalculationReason.EcomUnavailable,
        attempts: 1,
        lastError: error,
        lastTriedAt: new Date(),
      },
      update: {
        status: RecalculationTaskStatus.PENDING,
        attempts: { increment: 1 },
        lastError: error,
        lastTriedAt: new Date(),
      },
    });

    if (task.attempts < maxAttempts) {
      return task;
    }

    return client.stockRecalculationTask.update({
      where: { id: task.id },
      data: { status: RecalculationTaskStatus.ABANDONED },
    });
  }

  public async findPending(
    take: number,
    tx?: TransactionClient,
  ): Promise<StockRecalculationTask[]> {
    return this.client(tx).stockRecalculationTask.findMany({
      where: { status: RecalculationTaskStatus.PENDING },
      orderBy: { updatedAt: 'asc' },
      take,
    });
  }

  /** Closes the pair after a successful run. A no-op when no task was open. */
  public async markDone(
    target: StockTarget,
    tx?: TransactionClient,
  ): Promise<number> {
    const { count } = await this.client(tx).stockRecalculationTask.updateMany({
      where: { variantId: target.variantId, regionId: target.regionId },
      data: {
        status: RecalculationTaskStatus.DONE,
        lastError: null,
        lastTriedAt: new Date(),
      },
    });

    return count;
  }

  public async countByStatus(
    status: RecalculationTaskStatus,
    tx?: TransactionClient,
  ): Promise<number> {
    return this.client(tx).stockRecalculationTask.count({ where: { status } });
  }

  private identity(target: StockTarget) {
    return {
      variantId_regionId: {
        variantId: target.variantId,
        regionId: target.regionId,
      },
    };
  }

  private identityFields(target: StockTarget) {
    return {
      variantId: target.variantId,
      regionId: target.regionId,
      sku: target.sku,
      variantCode: target.variantCode,
      regionCode: target.regionCode,
    };
  }
}
