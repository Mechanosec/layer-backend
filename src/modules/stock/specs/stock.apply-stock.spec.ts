import { PinoLogger } from 'nestjs-pino';

import { TransactionClient } from '../../../shared/database/types/database.type';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { ProductRepository } from '../repositories/product.repository';
import { ShopStockRepository } from '../repositories/shop-stock.repository';
import { StockApplyStockService } from '../services/stock.apply-stock.service';
import { StockShopResolverService } from '../services/stock.shop-resolver.service';

const SHOPS: Record<
  string,
  { code: string; regionId: string; regionCode: string }
> = {
  '0119': { code: '0119', regionId: 'region-1', regionCode: 'CENTRAL' },
  '0120': { code: '0120', regionId: 'region-1', regionCode: 'CENTRAL' },
  '0230': { code: '0230', regionId: 'region-2', regionCode: 'WEST' },
};

function buildService(overrides: { currentQuantity?: number | null } = {}) {
  const logger = { warn: jest.fn(), info: jest.fn() } as unknown as PinoLogger;

  const productRepository = {
    ensureExists: jest.fn().mockResolvedValue({ sku: '200202' }),
  } as unknown as ProductRepository;

  const variantRepository = {
    ensureForStock: jest.fn((_sku: string, variantCode: string) =>
      Promise.resolve({ id: `variant-${variantCode}` }),
    ),
  } as unknown as ProductVariantRepository;

  const shopStockRepository = {
    findQuantity: jest
      .fn()
      .mockResolvedValue(
        overrides.currentQuantity === undefined ? 2 : overrides.currentQuantity,
      ),
    setQuantity: jest.fn().mockResolvedValue({}),
  } as unknown as ShopStockRepository;

  const shopResolver = {
    resolve: jest.fn((code: string) => Promise.resolve(SHOPS[code])),
  } as unknown as StockShopResolverService;

  const service = new StockApplyStockService(
    logger,
    productRepository,
    variantRepository,
    shopStockRepository,
    shopResolver,
  );

  return { service, variantRepository, shopStockRepository };
}

const tx = {} as TransactionClient;

describe(StockApplyStockService.name, () => {
  describe('apply', () => {
    it('should replace the stored quantity when BC reports an absolute value', async () => {
      const { service, shopStockRepository } = buildService({
        currentQuantity: 99,
      });

      await service.apply(
        {
          sku: '200202',
          lines: [{ variantCode: '000', shopCode: '0119', quantity: 10 }],
        },
        tx,
      );

      expect(shopStockRepository.setQuantity).toHaveBeenCalledWith(
        'variant-000',
        '0119',
        10,
        tx,
      );
      // An absolute value needs no read of the current one.
      expect(shopStockRepository.findQuantity).not.toHaveBeenCalled();
    });

    it('should adjust the stored quantity when BC reports a delta', async () => {
      const { service, shopStockRepository } = buildService({
        currentQuantity: 2,
      });

      await service.apply(
        {
          sku: '200202',
          lines: [{ variantCode: '000', shopCode: '0119', quantityDelta: 10 }],
        },
        tx,
      );

      expect(shopStockRepository.setQuantity).toHaveBeenCalledWith(
        'variant-000',
        '0119',
        12,
        tx,
      );
    });

    it('should clamp a negative result at zero', async () => {
      const { service, shopStockRepository } = buildService({
        currentQuantity: 2,
      });

      await service.apply(
        {
          sku: '200202',
          lines: [{ variantCode: '000', shopCode: '0119', quantityDelta: -5 }],
        },
        tx,
      );

      expect(shopStockRepository.setQuantity).toHaveBeenCalledWith(
        'variant-000',
        '0119',
        0,
        tx,
      );
    });

    it('should clamp a negative absolute quantity at zero', async () => {
      const { service, shopStockRepository } = buildService();

      await service.apply(
        {
          sku: '200202',
          lines: [{ variantCode: '000', shopCode: '0119', quantity: -4 }],
        },
        tx,
      );

      expect(shopStockRepository.setQuantity).toHaveBeenCalledWith(
        'variant-000',
        '0119',
        0,
        tx,
      );
    });

    it('should return one target per variant/region pair, not per warehouse', async () => {
      const { service } = buildService();

      // Two warehouses of CENTRAL plus one of WEST, for the same variant.
      const targets = await service.apply(
        {
          sku: '200202',
          lines: [
            { variantCode: '000', shopCode: '0119', quantity: 10 },
            { variantCode: '000', shopCode: '0120', quantity: 4 },
            { variantCode: '000', shopCode: '0230', quantity: 1 },
          ],
        },
        tx,
      );

      expect(targets).toHaveLength(2);
      expect(targets.map((target) => target.regionCode).sort()).toEqual([
        'CENTRAL',
        'WEST',
      ]);
    });

    it('should keep variants apart even in the same region', async () => {
      const { service } = buildService();

      const targets = await service.apply(
        {
          sku: '200202',
          lines: [
            { variantCode: '000', shopCode: '0119', quantity: 10 },
            { variantCode: '001', shopCode: '0119', quantity: 7 },
          ],
        },
        tx,
      );

      expect(targets.map((target) => target.variantId).sort()).toEqual([
        'variant-000',
        'variant-001',
      ]);
    });

    it('should pass the barcode and reported price through to the variant', async () => {
      const { service, variantRepository } = buildService();

      await service.apply(
        {
          sku: '200202',
          lines: [
            {
              variantCode: '000',
              shopCode: '0119',
              quantity: 10,
              barcodeNo: '770662476000',
              price: 699,
            },
          ],
        },
        tx,
      );

      expect(variantRepository.ensureForStock).toHaveBeenCalledWith(
        '200202',
        '000',
        { barcodeNo: '770662476000', price: 699 },
        tx,
      );
    });
  });
});
