import { Injectable, NotFoundException } from '@nestjs/common';

import {
  BcEvent,
  EcomStockOutbox,
  StockRecalculationTask,
} from '../../generated/prisma/client';
import { PipelineRepository } from './repositories/pipeline.repository';
import {
  PipelineActivityDto,
  PipelineEventDto,
  PipelineOutboxDto,
  PipelineStandDto,
  PipelineTraceDto,
} from './response/pipeline.response.dto';

const RECENT_LIMIT = 25;

/**
 * Assembles the whole journey of one variant — what Business Central sent, what
 * was stored, how the number was worked out, and what e-com was told — so it can
 * be shown end to end rather than inferred from logs.
 */
@Injectable()
export class PipelineService {
  constructor(private readonly pipelineRepository: PipelineRepository) {}

  public async getStand(): Promise<PipelineStandDto> {
    const [shops, variants] = await Promise.all([
      this.pipelineRepository.findShops(),
      this.pipelineRepository.findKnownVariants(50),
    ]);

    return {
      shops: shops.map((shop) => ({
        code: shop.code,
        name: shop.name,
        regionCode: shop.region.bcCode,
        regionName: shop.region.name,
        safetyBuffer: shop.region.safetyBuffer,
        includedInEcom: shop.includedInEcom,
      })),
      variants: variants.map((variant) => ({
        sku: variant.sku,
        variantCode: variant.variantCode,
        name: variant.product.name,
        metadata: variant.metadata,
      })),
    };
  }

  public async getTrace(
    sku: string,
    variantCode: string,
  ): Promise<PipelineTraceDto> {
    const variant = await this.pipelineRepository.findVariantWithStock(
      sku,
      variantCode,
    );

    if (!variant) {
      throw new NotFoundException(
        `Business Central has not sent anything about ${sku}/${variantCode} yet`,
      );
    }

    const [events, outbox, blocked] = await Promise.all([
      this.pipelineRepository.findEventsForSku(sku, RECENT_LIMIT),
      this.pipelineRepository.findOutboxForSku(sku, RECENT_LIMIT),
      this.pipelineRepository.findTasksForVariant(variant.id),
    ]);

    return {
      sku: variant.sku,
      variantCode: variant.variantCode,
      name: variant.product.name,
      metadata: variant.metadata,
      unitMeasure: variant.unitMeasure,
      shops: variant.stocks.map((stock) => ({
        shopCode: stock.shopCode,
        shopName: stock.shop.name,
        regionCode: stock.shop.region.bcCode,
        quantity: stock.quantity,
        includedInEcom: stock.shop.includedInEcom,
        reportedAt: stock.reportedAt,
      })),
      calculations: variant.ecomStocks.map((ecom) => ({
        regionCode: ecom.region.bcCode,
        regionName: ecom.region.name,
        shopsTotal: ecom.shopsTotal,
        safetyBuffer: ecom.safetyBuffer,
        reserved: ecom.reserved,
        quantity: ecom.quantity,
        publishedQuantity: ecom.publishedQuantity,
        reservationsStale: ecom.reservationsStale,
        // The calculated number differs from what e-com holds only when it was
        // deliberately not sent.
        withheld:
          ecom.publishedQuantity === null ||
          ecom.publishedQuantity !== ecom.quantity,
        calculatedAt: ecom.calculatedAt,
        publishedAt: ecom.publishedAt,
      })),
      events: events.map(toEventDto),
      outbox: outbox.map(toOutboxDto),
      blocked: blocked.map(toBlockedDto),
    };
  }

  public async getActivity(): Promise<PipelineActivityDto> {
    const [events, outbox] = await Promise.all([
      this.pipelineRepository.findRecentEvents(RECENT_LIMIT),
      this.pipelineRepository.findRecentOutbox(RECENT_LIMIT),
    ]);

    return { events: events.map(toEventDto), outbox: outbox.map(toOutboxDto) };
  }
}

function toEventDto(event: BcEvent): PipelineEventDto {
  return {
    type: event.type,
    status: event.status,
    topic: event.topic,
    partition: event.partition,
    // Kafka offsets are bigint, which JSON cannot represent.
    offset: event.offset.toString(),
    key: event.key,
    payload: event.payload,
    receivedAt: event.receivedAt,
    processedAt: event.processedAt,
    error: event.error,
  };
}

function toOutboxDto(row: EcomStockOutbox): PipelineOutboxDto {
  return {
    sku: row.sku,
    variantCode: row.variantCode,
    regionCode: row.regionCode,
    quantity: row.quantity,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  };
}

function toBlockedDto(task: StockRecalculationTask) {
  return {
    regionCode: task.regionCode,
    status: task.status,
    reason: task.reason,
    attempts: task.attempts,
    lastError: task.lastError,
    lastTriedAt: task.lastTriedAt,
  };
}
