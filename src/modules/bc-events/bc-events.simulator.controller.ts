import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { KAFKA_TOPICS } from '../../shared/kafka/constants/kafka-topics.constant';
import { KafkaMessageMeta } from '../../shared/kafka/types/kafka.type';
import { ESwaggerApiTag } from '../../shared/swagger/swagger.util';
import { BcEventsService } from './bc-events.service';
import { BcProductEventDto } from './dto/bc-product-event.dto';
import { BcStockEventDto } from './dto/bc-stock-event.dto';
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

  @Post('product')
  @ApiOperation({
    summary: 'Inject a product ("загальний") message as if BC had sent it',
    description:
      'Master data only — creates the product and its variants, no stock.',
  })
  @ApiOkResponse({
    schema: {
      properties: { outcome: { enum: Object.values(EIngestOutcome) } },
    },
  })
  public async product(
    @Body() body: BcProductEventDto,
  ): Promise<{ outcome: EIngestOutcome }> {
    const outcome = await this.bcEventsService.ingestProduct(
      { ...body },
      this.buildMeta(KAFKA_TOPICS.bcProduct, body.sku),
    );

    return { outcome };
  }

  @Post('stock')
  @ApiOperation({
    summary: 'Inject a stock message as if BC had sent it',
    description:
      'Accepts every shape under discussion: warehouses nested per variant, or one warehouseCode for the message; absolute quantity or quantityDelta.',
  })
  @ApiOkResponse({
    schema: {
      properties: { outcome: { enum: Object.values(EIngestOutcome) } },
    },
  })
  public async stock(
    @Body() body: BcStockEventDto,
  ): Promise<{ outcome: EIngestOutcome }> {
    const outcome = await this.bcEventsService.ingestStock(
      { ...body },
      this.buildMeta(KAFKA_TOPICS.bcStock, body.sku),
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
