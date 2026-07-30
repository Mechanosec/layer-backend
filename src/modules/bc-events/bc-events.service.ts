import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { HttpCodeBcEventException } from '../../shared/constants/http-exception-code.constant';
import { BcEventType } from '../../generated/prisma/client';
import { KafkaMessageMeta } from '../../shared/kafka/types/kafka.type';
import { describeError, handleExceptionCode } from '../../shared/utils/utils';
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
    private readonly logger: PinoLogger,
    private readonly ingestService: BcEventsIngestService,
    private readonly stockService: StockService,
  ) {}

  /** The "загальний" message: product and variant master data, no quantities. */
  public async ingestProduct(
    payload: unknown,
    meta: KafkaMessageMeta,
  ): Promise<EIngestOutcome> {
    try {
      return await this.runProductIngest(payload, meta);
    } catch (error) {
      // Reached only when the inbox itself is unavailable: a malformed or
      // unappliable payload is parked by the ingest service, not thrown.
      const errorMessage = `[${BcEventsService.name}]Ingesting the product message from ${meta.topic}@${meta.offset} was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);
      throw handleExceptionCode(error as Error, errorMessage);
    }
  }

  private async runProductIngest(
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
    try {
      return await this.runStockIngest(payload, meta);
    } catch (error) {
      const errorMessage = `[${BcEventsService.name}]Ingesting the stock message from ${meta.topic}@${meta.offset} was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);
      throw handleExceptionCode(error as Error, errorMessage);
    }
  }

  private async runStockIngest(
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
    const shared = { variantCode: variant.variantCode };
    const nested = variant.warehouses ?? [];
    const hasBareNumber =
      present(variant.quantity) || present(variant.quantityDelta);

    if (nested.length > 0) {
      if (hasBareNumber) {
        // Mixing the two shapes means one of BC's numbers would be dropped.
        throw new BadRequestException({
          message: `Variant ${variant.variantCode} of ${dto.sku} carries both warehouses[] and a bare quantity`,
          code: HttpCodeBcEventException.BC_STOCK_LINE_MIXED_SHAPES,
        });
      }

      for (const warehouse of nested) {
        lines.push(
          buildLine(dto.sku, shared, warehouse.warehouseCode, warehouse),
        );
      }
      continue;
    }

    if (!dto.warehouseCode) {
      throw new BadRequestException({
        message: `Variant ${variant.variantCode} of ${dto.sku} has no warehouses and the message has no warehouseCode`,
        code: HttpCodeBcEventException.BC_STOCK_LINE_WITHOUT_WAREHOUSE,
      });
    }

    lines.push(buildLine(dto.sku, shared, dto.warehouseCode, variant));
  }

  return { sku: dto.sku, lines };
}

/**
 * One variant/warehouse line, with the number BC sent.
 *
 * `null` is treated as absent, not as a value. A producer that emits the unused
 * field as `null` rather than omitting it would otherwise land here as an
 * absolute zero and wipe a real warehouse's stock: `@IsOptional()` skips
 * validation for `null`, so it reaches this point looking like data.
 */
function buildLine(
  sku: string,
  shared: { variantCode: string },
  shopCode: string,
  reported: { quantity?: number | null; quantityDelta?: number | null },
): StockLine {
  const quantity = present(reported.quantity) ? reported.quantity : undefined;
  const quantityDelta = present(reported.quantityDelta)
    ? reported.quantityDelta
    : undefined;

  if (quantity !== undefined && quantityDelta !== undefined) {
    throw new BadRequestException({
      message: `Line ${sku}/${shared.variantCode} at ${shopCode} carries both quantity and quantityDelta`,
      code: HttpCodeBcEventException.BC_STOCK_LINE_AMBIGUOUS,
    });
  }

  if (quantity === undefined && quantityDelta === undefined) {
    // Applying such a line would silently zero the stock of a real warehouse.
    throw new BadRequestException({
      message: `Line ${sku}/${shared.variantCode} at ${shopCode} carries neither quantity nor quantityDelta`,
      code: HttpCodeBcEventException.BC_STOCK_LINE_WITHOUT_QUANTITY,
    });
  }

  return { ...shared, shopCode, quantity, quantityDelta };
}

function present(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

function toDate(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}
