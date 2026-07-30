import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';

import { BcEventType } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';
import { KafkaMessageMeta } from '../../../shared/kafka/types/kafka.type';
import { describeError } from '../../../shared/utils/utils';
import { StockService } from '../../stock/stock.service';
import { StockTarget } from '../../stock/types/stock.type';
import { BcEventRepository } from '../repositories/bc-event.repository';
import { EIngestOutcome } from '../types/bc-events.type';

/**
 * Turns a validated payload into the stock changes it describes. One message can
 * touch many variant/warehouse pairs, and a catalogue message touches none.
 */
type ApplyFn<T> = (dto: T, tx: TransactionClient) => Promise<StockTarget[]>;

@Injectable()
export class BcEventsIngestService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly database: DatabaseService,
    private readonly eventRepository: BcEventRepository,
    private readonly stockService: StockService,
  ) {}

  /**
   * Records the message and applies it in one transaction, then runs the
   * calculation outside it.
   *
   * The split is deliberate. Applying a BC event is pure database work and must
   * be atomic — a delta applied twice is wrong. The calculation needs e-com's
   * reservations over HTTP, which has no place inside a transaction, and it is
   * derived data that can always be recomputed. So the transaction commits "the
   * stock changed and owes a recalculation", and the calculation follows.
   *
   * Nothing is rethrown: a message that cannot be applied is parked as FAILED in
   * the inbox rather than redelivered forever, with its raw payload kept so a fix
   * can replay it.
   */
  public async ingest<T extends object>(
    type: BcEventType,
    dtoClass: new () => T,
    payload: unknown,
    meta: KafkaMessageMeta,
    apply: ApplyFn<T>,
  ): Promise<EIngestOutcome> {
    const isNew = await this.eventRepository.record(type, payload, meta);

    if (!isNew) {
      this.logger.debug(
        `[${BcEventsIngestService.name}]Skipping already-seen message ${meta.topic}/${meta.partition}@${meta.offset}`,
      );

      return EIngestOutcome.Duplicate;
    }

    const dto = plainToInstance(dtoClass, payload, {
      enableImplicitConversion: true,
    });
    const errors = validateSync(dto, {
      whitelist: true,
      forbidUnknownValues: false,
    });

    if (errors.length > 0) {
      const details = errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('; ');

      this.logger.error(
        `[${BcEventsIngestService.name}]Rejecting malformed ${type} event with error: ${details}`,
      );
      await this.eventRepository.markFailed(meta, details);

      return EIngestOutcome.Invalid;
    }

    let targets: StockTarget[];

    try {
      targets = await this.database.$transaction(async (tx) => {
        const applied = await apply(dto, tx);
        await this.eventRepository.markProcessed(meta, tx);

        return applied;
      });
    } catch (error) {
      const errorMessage = `[${BcEventsIngestService.name}]Processing the ${type} event was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);

      // Never rethrown: Kafka would redeliver forever. The message is parked as
      // FAILED with its raw payload instead, so a fix can replay it.
      await this.eventRepository.markFailed(
        meta,
        error instanceof Error ? error.message : describeError(error),
      );

      return EIngestOutcome.Failed;
    }

    // The recalculation tasks are committed by now, so a failure here only delays
    // publication — the retry worker owns them from this point on.
    await this.stockService.tryRecalculate(targets);

    return EIngestOutcome.Processed;
  }
}
