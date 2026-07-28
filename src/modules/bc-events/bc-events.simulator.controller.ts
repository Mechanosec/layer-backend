import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { KAFKA_TOPICS } from '../../shared/kafka/constants/kafka-topics.constant';
import { KafkaMessageMeta } from '../../shared/kafka/types/kafka.type';
import { ESwaggerApiTag } from '../../shared/swagger/swagger.util';
import { BcEventsService } from './bc-events.service';
import { BcGlobalStockEventDto } from './dto/bc-global-stock-event.dto';
import { BcUnitStockEventDto } from './dto/bc-unit-stock-event.dto';
import { EIngestOutcome } from './types/bc-events.type';

/**
 * Feeds Business Central payloads straight into the ingest pipeline, so the
 * calculation can be exercised without a real BC producer.
 *
 * Registered only outside production — see BcEventsModule.
 */
@ApiTags(ESwaggerApiTag.BusinessCentralDev)
@Controller('bc/simulate')
export class BcEventsSimulatorController {
  /** Keeps simulated messages from colliding with each other in the inbox. */
  private sequence = 0;

  constructor(private readonly bcEventsService: BcEventsService) {}

  @Post('global')
  @ApiOperation({
    summary: 'Inject a "global" stock snapshot as if BC had sent it',
  })
  @ApiOkResponse({
    schema: {
      properties: { outcome: { enum: Object.values(EIngestOutcome) } },
    },
  })
  public async global(
    @Body() body: BcGlobalStockEventDto,
  ): Promise<{ outcome: EIngestOutcome }> {
    const outcome = await this.bcEventsService.ingestGlobal(
      { ...body },
      this.buildMeta(
        KAFKA_TOPICS.bcStockGlobal,
        `${body.sku}:${body.variantCode}`,
      ),
    );

    return { outcome };
  }

  @Post('unit')
  @ApiOperation({ summary: 'Inject a "unit" stock delta as if BC had sent it' })
  @ApiOkResponse({
    schema: {
      properties: { outcome: { enum: Object.values(EIngestOutcome) } },
    },
  })
  public async unit(
    @Body() body: BcUnitStockEventDto,
  ): Promise<{ outcome: EIngestOutcome }> {
    const outcome = await this.bcEventsService.ingestUnit(
      { ...body },
      this.buildMeta(
        KAFKA_TOPICS.bcStockUnit,
        `${body.sku}:${body.variantCode}`,
      ),
    );

    return { outcome };
  }

  /**
   * A distinct topic name keeps simulated offsets out of the real topic's
   * (topic, partition, offset) space, so replaying real messages still works.
   */
  private buildMeta(topic: string, key: string): KafkaMessageMeta {
    this.sequence += 1;

    return {
      topic: `${topic}#simulated`,
      partition: 0,
      offset: `${Date.now()}${this.sequence.toString().padStart(4, '0')}`,
      key,
    };
  }
}
