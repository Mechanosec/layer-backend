import { BadRequestException } from '@nestjs/common';

import { StockService } from '../../stock/stock.service';
import {
  ProductCatalogueCommand,
  StockUpdateCommand,
} from '../../stock/types/stock.type';
import { BcEventsService } from '../bc-events.service';
import { BcEventsIngestService } from '../services/bc-events.ingest.service';

/**
 * Exercises the mapping from Business Central's payloads onto domain commands.
 * The ingest service is stubbed to run the apply callback directly, so what is
 * asserted is exactly the command the stock module would receive.
 */
type ApplyCallback = (dto: unknown, tx: unknown) => Promise<unknown>;

function buildService() {
  const ingestService = {
    ingest: jest.fn(
      async (
        _type: unknown,
        _dtoClass: unknown,
        payload: unknown,
        _meta: unknown,
        apply: ApplyCallback,
      ) => {
        // Mirrors the real service: validated DTO in, apply callback invoked.
        await apply(payload, {});
        return 'processed';
      },
    ),
  } as unknown as BcEventsIngestService;

  const stockService = {
    applyCatalogue: jest.fn().mockResolvedValue(undefined),
    applyStock: jest.fn().mockResolvedValue([]),
  } as unknown as StockService;

  return {
    service: new BcEventsService(ingestService, stockService),
    stockService,
  };
}

const META = { topic: 't', partition: 0, offset: '1' };

function lastStockCommand(stockService: StockService): StockUpdateCommand {
  return (stockService.applyStock as jest.Mock).mock
    .calls[0][0] as StockUpdateCommand;
}

describe(BcEventsService.name, () => {
  describe('ingestProduct', () => {
    it('should lift productHierarchy and season onto the product', async () => {
      const { service, stockService } = buildService();

      await service.ingestProduct(
        {
          sku: '200202',
          name: 'Кросівки жіночі',
          unitMeasure: 'ПАР',
          brand: 'NORBY',
          season: {
            name: 'ВЕСНА 2025',
            startingDate: '2025-03-01',
            endingDate: '2025-05-31',
          },
          productHierarchy: {
            division: 'ОДЯГ',
            category: 'Кросівки',
            retailProductCode: 'КРОСІВКИ ЖІНОЧІ',
          },
          price: 699,
          customCategoryCode: '6402999100',
          customCategoryCodeDescription: 'менш як 24 см',
          variants: [
            {
              variantCode: '000',
              barcodeNo: '770662476000',
              color: 'КОРИЧНЕВИЙ',
              size: '42',
            },
            {
              variantCode: '001',
              barcodeNo: '770662476001',
              color: 'КОРИЧНЕВИЙ',
              size: '44',
            },
          ],
        },
        META,
      );

      const command = (stockService.applyCatalogue as jest.Mock).mock
        .calls[0][0] as ProductCatalogueCommand;

      expect(command).toMatchObject({
        sku: '200202',
        name: 'Кросівки жіночі',
        unitMeasure: 'ПАР',
        brand: 'NORBY',
        price: 699,
        division: 'ОДЯГ',
        category: 'Кросівки',
        retailProductCode: 'КРОСІВКИ ЖІНОЧІ',
        customCategoryCode: '6402999100',
      });
      expect(command.season?.name).toBe('ВЕСНА 2025');
      expect(command.season?.startsAt).toEqual(new Date('2025-03-01'));
      expect(command.variants).toHaveLength(2);
      expect(command.variants[1]).toEqual({
        variantCode: '001',
        barcodeNo: '770662476001',
        color: 'КОРИЧНЕВИЙ',
        size: '44',
      });
    });

    it('should not touch stock', async () => {
      const { service, stockService } = buildService();

      await service.ingestProduct(
        { sku: '200202', name: 'X', variants: [{ variantCode: '000' }] },
        META,
      );

      expect(stockService.applyStock).not.toHaveBeenCalled();
    });
  });

  describe('ingestStock', () => {
    it('should flatten warehouses nested per variant into one line each', async () => {
      const { service, stockService } = buildService();

      await service.ingestStock(
        {
          sku: '200202',
          variants: [
            {
              variantCode: '000',
              barcodeNo: '770662476000',
              price: 699,
              warehouses: [
                { warehouseCode: '0119', quantity: 10 },
                { warehouseCode: '0120', quantity: 4 },
              ],
            },
            {
              variantCode: '001',
              warehouses: [{ warehouseCode: '0119', quantity: 7 }],
            },
          ],
        },
        META,
      );

      const command = lastStockCommand(stockService);

      expect(command.sku).toBe('200202');
      expect(command.lines).toEqual([
        {
          variantCode: '000',
          barcodeNo: '770662476000',
          price: 699,
          shopCode: '0119',
          quantity: 10,
          quantityDelta: undefined,
        },
        {
          variantCode: '000',
          barcodeNo: '770662476000',
          price: 699,
          shopCode: '0120',
          quantity: 4,
          quantityDelta: undefined,
        },
        {
          variantCode: '001',
          barcodeNo: undefined,
          price: undefined,
          shopCode: '0119',
          quantity: 7,
          quantityDelta: undefined,
        },
      ]);
    });

    it('should use the top-level warehouseCode when variants carry a bare quantity', async () => {
      const { service, stockService } = buildService();

      await service.ingestStock(
        {
          warehouseCode: '0119',
          sku: '200202',
          variants: [
            {
              variantCode: '000',
              barcodeNo: '770662476000',
              price: 699,
              quantity: 10,
            },
          ],
        },
        META,
      );

      expect(lastStockCommand(stockService).lines).toEqual([
        {
          variantCode: '000',
          barcodeNo: '770662476000',
          price: 699,
          shopCode: '0119',
          quantity: 10,
          quantityDelta: undefined,
        },
      ]);
    });

    it('should carry a delta through instead of a quantity, if that is what BC sends', async () => {
      const { service, stockService } = buildService();

      await service.ingestStock(
        {
          sku: '200202',
          variants: [
            {
              variantCode: '000',
              warehouses: [{ warehouseCode: '0119', quantityDelta: -3 }],
            },
          ],
        },
        META,
      );

      expect(lastStockCommand(stockService).lines[0]).toMatchObject({
        shopCode: '0119',
        quantity: undefined,
        quantityDelta: -3,
      });
    });

    it('should reject a variant with neither warehouses nor a message warehouseCode', async () => {
      const { service } = buildService();

      await expect(
        service.ingestStock(
          { sku: '200202', variants: [{ variantCode: '000', quantity: 5 }] },
          META,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a line that names a warehouse but no number at all', async () => {
      const { service } = buildService();

      // Applying this would silently zero a real warehouse.
      await expect(
        service.ingestStock(
          {
            sku: '200202',
            variants: [
              { variantCode: '000', warehouses: [{ warehouseCode: '0119' }] },
            ],
          },
          META,
        ),
      ).rejects.toThrow(/neither quantity nor quantityDelta/);
    });
  });
});
