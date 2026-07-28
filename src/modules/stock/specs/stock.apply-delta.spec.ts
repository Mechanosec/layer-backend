import { PinoLogger } from 'nestjs-pino';

import { TransactionClient } from '../../../shared/database/types/database.type';
import { ProductVariantRepository } from '../repositories/product-variant.repository';
import { ProductRepository } from '../repositories/product.repository';
import { ShopStockRepository } from '../repositories/shop-stock.repository';
import { StockApplyDeltaService } from '../services/stock.apply-delta.service';
import { StockShopResolverService } from '../services/stock.shop-resolver.service';

const SHOP = { code: '0119', regionId: 'region-1', regionCode: 'CENTRAL' };
const COMMAND = {
  sku: '200202',
  variantCode: '000',
  shopCode: '0119',
  quantityDelta: 10,
};

function buildService(overrides: { currentQuantity?: number | null } = {}) {
  const logger = { warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger;

  const productRepository = {
    ensureExists: jest.fn().mockResolvedValue({ sku: '200202' }),
  } as unknown as ProductRepository;

  const variantRepository = {
    findId: jest.fn().mockResolvedValue({ id: 'variant-1' }),
    create: jest.fn().mockResolvedValue({ id: 'variant-1' }),
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
    resolve: jest.fn().mockResolvedValue(SHOP),
  } as unknown as StockShopResolverService;

  const service = new StockApplyDeltaService(
    logger,
    productRepository,
    variantRepository,
    shopStockRepository,
    shopResolver,
  );

  return { service, productRepository, variantRepository, shopStockRepository };
}

const tx = {} as TransactionClient;

describe(StockApplyDeltaService.name, () => {
  describe('apply', () => {
    it('should add the delta to the current shop quantity', async () => {
      const { service, shopStockRepository } = buildService({
        currentQuantity: 2,
      });

      await service.apply(COMMAND, tx);

      expect(shopStockRepository.setQuantity).toHaveBeenCalledWith(
        'variant-1',
        '0119',
        12,
        tx,
      );
    });

    it('should clamp at zero when BC reports more outbound units than we hold', async () => {
      const { service, shopStockRepository } = buildService({
        currentQuantity: 2,
      });

      await service.apply({ ...COMMAND, quantityDelta: -5 }, tx);

      expect(shopStockRepository.setQuantity).toHaveBeenCalledWith(
        'variant-1',
        '0119',
        0,
        tx,
      );
    });

    it('should treat a variant with no stored stock as zero', async () => {
      const { service, shopStockRepository } = buildService({
        currentQuantity: null,
      });

      await service.apply({ ...COMMAND, quantityDelta: 4 }, tx);

      expect(shopStockRepository.setQuantity).toHaveBeenCalledWith(
        'variant-1',
        '0119',
        4,
        tx,
      );
    });

    it('should create a placeholder product and variant so an early delta is not lost', async () => {
      const { service, productRepository, variantRepository } = buildService();
      (variantRepository.findId as jest.Mock).mockResolvedValue(null);

      await service.apply({ ...COMMAND, sku: '999999' }, tx);

      expect(productRepository.ensureExists).toHaveBeenCalledWith('999999', tx);
      expect(variantRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ sku: '999999', variantCode: '000' }),
        tx,
      );
    });

    it('should report the region of the shop the event referred to', async () => {
      const { service } = buildService();

      const target = await service.apply(COMMAND, tx);

      expect(target).toEqual({
        variantId: 'variant-1',
        sku: '200202',
        variantCode: '000',
        regionId: 'region-1',
        regionCode: 'CENTRAL',
      });
    });
  });
});
