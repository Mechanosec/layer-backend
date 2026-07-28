import { Injectable } from '@nestjs/common';

import {
  BcEventStatus,
  BcEventType,
  Prisma,
} from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/database/base.repository';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';
import { KafkaMessageMeta } from '../../../shared/kafka/types/kafka.type';

/** Inbox of raw Business Central messages; also the idempotency guard. */
@Injectable()
export class BcEventRepository extends BaseRepository {
  constructor(database: DatabaseService) {
    super(database);
  }

  /**
   * Records the message unless its (topic, partition, offset) is already known.
   * Returns false when the message was seen before, which makes redelivery a
   * no-op instead of double-counting stock.
   */
  public async record(
    type: BcEventType,
    payload: unknown,
    meta: KafkaMessageMeta,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const { count } = await this.client(tx).bcEvent.createMany({
      data: [
        {
          type,
          topic: meta.topic,
          partition: meta.partition,
          offset: BigInt(meta.offset),
          key: meta.key,
          payload: payload as Prisma.InputJsonValue,
        },
      ],
      skipDuplicates: true,
    });

    return count > 0;
  }

  public async markProcessed(
    meta: KafkaMessageMeta,
    tx?: TransactionClient,
  ): Promise<void> {
    await this.client(tx).bcEvent.update({
      where: this.identity(meta),
      data: { status: BcEventStatus.PROCESSED, processedAt: new Date() },
    });
  }

  public async markFailed(
    meta: KafkaMessageMeta,
    error: string,
    tx?: TransactionClient,
  ): Promise<void> {
    await this.client(tx).bcEvent.update({
      where: this.identity(meta),
      data: {
        status: BcEventStatus.FAILED,
        error,
        processedAt: new Date(),
      },
    });
  }

  private identity(meta: KafkaMessageMeta) {
    return {
      topic_partition_offset: {
        topic: meta.topic,
        partition: meta.partition,
        offset: BigInt(meta.offset),
      },
    };
  }
}
