import { BadRequestException, Injectable } from '@nestjs/common';

import { BcEventType } from '../../generated/prisma/client';
import { KafkaMessageMeta } from '../../shared/kafka/types/kafka.type';
import { StockService } from '../stock/stock.service';
import {
  ProductCatalogueCommand,
  StockLine,
  StockUpdateCommand,
} from '../stock/types/stock.type';
import { BcProductEventDto } from './dto/bc-product-event.dto';
import { BcStockEventDto } from './dto/bc-stock-event.dto';
import { BcEventsIngestService } from './services/bc-events.ingest.service';
import { EIngestOutcome } from './types/bc-events.type';

/**
 * Facade for Business Central ingest, and the only place that knows what BC's
 * messages look like. Maps them onto stock domain commands, which is what keeps
 * BC's still-changing shapes from reaching the rest of the service.
 */
@Injectable()
export class BcEventsService {
  constructor(
    private readonly ingestService: BcEventsIngestService,
    private readonly stockService: StockService,
  ) {}

  /** The "загальний" message: product and variant master data, no quantities. */
  public async ingestProduct(
    payload: unknown,
    meta: KafkaMessageMeta,
  ): Promise<EIngestOutcome> {
    return this.ingestService.ingest(
      BcEventType.PRODUCT,
      BcProductEventDto,
      payload,
      meta,
      async (dto, tx) => {
        await this.stockService.applyCatalogue(toCatalogueCommand(dto), tx);

        // Master data changes nothing that feeds the formula.
        return [];
      },
    );
  }

  /** The stock message, in whichever of the four shapes BC sends. */
  public async ingestStock(
    payload: unknown,
    meta: KafkaMessageMeta,
  ): Promise<EIngestOutcome> {
    return this.ingestService.ingest(
      BcEventType.STOCK,
      BcStockEventDto,
      payload,
      meta,
      (dto, tx) => this.stockService.applyStock(toStockCommand(dto), tx),
    );
  }
}

function toCatalogueCommand(dto: BcProductEventDto): ProductCatalogueCommand {
  return {
    sku: dto.sku,
    name: dto.name,
    brand: dto.brand,
    unitMeasure: dto.unitMeasure,
    price: dto.price,
    division: dto.productHierarchy?.division,
    category: dto.productHierarchy?.category,
    retailProductCode: dto.productHierarchy?.retailProductCode,
    customCategoryCode: dto.customCategoryCode,
    customCategoryCodeDescription: dto.customCategoryCodeDescription,
    season: dto.season
      ? {
          name: dto.season.name,
          startsAt: toDate(dto.season.startingDate),
          endsAt: toDate(dto.season.endingDate),
        }
      : undefined,
    variants: dto.variants.map((variant) => ({
      variantCode: variant.variantCode,
      barcodeNo: variant.barcodeNo,
      color: variant.color,
      size: variant.size,
    })),
  };
}

/**
 * Flattens the stock message into one line per variant/warehouse pair, whichever
 * shape it arrived in:
 *
 *   variants[].warehouses[]  → a line per warehouse listed on the variant
 *   warehouseCode + variants[] → a line per variant, all in that warehouse
 */
function toStockCommand(dto: BcStockEventDto): StockUpdateCommand {
  const lines: StockLine[] = [];

  for (const variant of dto.variants) {
    const shared = {
      variantCode: variant.variantCode,
      barcodeNo: variant.barcodeNo,
      price: variant.price,
    };

    if (variant.warehouses && variant.warehouses.length > 0) {
      for (const warehouse of variant.warehouses) {
        lines.push({
          ...shared,
          shopCode: warehouse.warehouseCode,
          quantity: warehouse.quantity,
          quantityDelta: warehouse.quantityDelta,
        });
      }
      continue;
    }

    if (!dto.warehouseCode) {
      throw new BadRequestException(
        `Variant ${variant.variantCode} of ${dto.sku} has no warehouses and the message has no warehouseCode`,
      );
    }

    lines.push({
      ...shared,
      shopCode: dto.warehouseCode,
      quantity: variant.quantity,
      quantityDelta: variant.quantityDelta,
    });
  }

  const blind = lines.find(
    (line) => line.quantity === undefined && line.quantityDelta === undefined,
  );
  if (blind) {
    // Applying such a line would silently zero the stock of a real warehouse.
    throw new BadRequestException(
      `Line ${dto.sku}/${blind.variantCode} at ${blind.shopCode} carries neither quantity nor quantityDelta`,
    );
  }

  return { sku: dto.sku, lines };
}

function toDate(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}
