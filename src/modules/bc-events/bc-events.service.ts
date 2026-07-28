import { Injectable } from '@nestjs/common';

import { BcEventType } from '../../generated/prisma/client';
import { KafkaMessageMeta } from '../../shared/kafka/types/kafka.type';
import { StockService } from '../stock/stock.service';
import { BcGlobalStockEventDto } from './dto/bc-global-stock-event.dto';
import { BcUnitStockEventDto } from './dto/bc-unit-stock-event.dto';
import { BcEventsIngestService } from './services/bc-events.ingest.service';
import { EIngestOutcome } from './types/bc-events.type';

/**
 * Facade for Business Central ingest. Maps the transport DTOs onto stock domain
 * commands, so the stock module never sees the shape of a Kafka message.
 */
@Injectable()
export class BcEventsService {
  constructor(
    private readonly ingestService: BcEventsIngestService,
    private readonly stockService: StockService,
  ) {}

  public async ingestGlobal(
    payload: unknown,
    meta: KafkaMessageMeta,
  ): Promise<EIngestOutcome> {
    return this.ingestService.ingest(
      BcEventType.GLOBAL,
      BcGlobalStockEventDto,
      payload,
      meta,
      (dto, tx) =>
        this.stockService.applySnapshot(
          {
            sku: dto.sku,
            name: dto.name,
            variantCode: dto.variantCode,
            shopCode: dto.shopCode,
            quantity: dto.quantity,
            metadata: dto.metadata,
            unitMeasure: dto.unitMeasure,
            price: dto.price,
            category: dto.category,
            brand: dto.brand,
            customCategoryCode: dto.customCategoryCode,
            customCategoryCodeDescription: dto.customCategoryCodeDescription,
          },
          tx,
        ),
    );
  }

  public async ingestUnit(
    payload: unknown,
    meta: KafkaMessageMeta,
  ): Promise<EIngestOutcome> {
    return this.ingestService.ingest(
      BcEventType.UNIT,
      BcUnitStockEventDto,
      payload,
      meta,
      (dto, tx) =>
        this.stockService.applyDelta(
          {
            sku: dto.sku,
            variantCode: dto.variantCode,
            shopCode: dto.shopCode,
            quantityDelta: dto.quantityDelta,
            unitMeasure: dto.unitMeasure,
          },
          tx,
        ),
    );
  }
}
