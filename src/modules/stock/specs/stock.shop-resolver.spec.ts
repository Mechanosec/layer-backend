import { PinoLogger } from 'nestjs-pino';

import { TransactionClient } from '../../../shared/database/types/database.type';
import { UNASSIGNED_REGION_CODE } from '../constants/stock.constants';
import { RegionRepository } from '../repositories/region.repository';
import { ShopRepository } from '../repositories/shop.repository';
import { StockShopResolverService } from '../services/stock.shop-resolver.service';

const KNOWN = { code: '0119', regionId: 'region-1', regionCode: 'CENTRAL' };
const PLACEHOLDER = {
  code: '9999',
  regionId: 'region-unassigned',
  regionCode: UNASSIGNED_REGION_CODE,
};

function buildService(options: { known?: boolean } = {}) {
  const logger = { warn: jest.fn() } as unknown as PinoLogger;

  const shopRepository = {
    findByCode: jest
      .fn()
      .mockResolvedValue(options.known === false ? null : KNOWN),
    ensureUnmapped: jest.fn().mockResolvedValue(PLACEHOLDER),
  } as unknown as ShopRepository;

  const regionRepository = {
    ensureByCode: jest.fn().mockResolvedValue({
      id: 'region-unassigned',
      bcCode: UNASSIGNED_REGION_CODE,
    }),
  } as unknown as RegionRepository;

  const service = new StockShopResolverService(
    logger,
    shopRepository,
    regionRepository,
  );

  return { service, shopRepository, regionRepository };
}

const tx = {} as TransactionClient;

describe(StockShopResolverService.name, () => {
  describe('resolve', () => {
    it('should return a known shop with its region', async () => {
      const { service, shopRepository, regionRepository } = buildService();

      await expect(service.resolve('0119', tx)).resolves.toEqual(KNOWN);
      expect(shopRepository.ensureUnmapped).not.toHaveBeenCalled();
      expect(regionRepository.ensureByCode).not.toHaveBeenCalled();
    });

    it('should park a warehouse BC has not mapped in the UNASSIGNED region', async () => {
      const { service, regionRepository } = buildService({ known: false });

      const shop = await service.resolve('9999', tx);

      expect(shop.regionCode).toBe(UNASSIGNED_REGION_CODE);
      expect(regionRepository.ensureByCode).toHaveBeenCalledWith(
        expect.objectContaining({ bcCode: UNASSIGNED_REGION_CODE }),
        tx,
      );
    });

    it('should create it as NOT feeding e-com, so its stock is never published', async () => {
      const { service, shopRepository } = buildService({ known: false });

      await service.resolve('9999', tx);

      // Failing open here would publish a phantom UNASSIGNED region to e-com and
      // offer an unmapped warehouse's whole stock for sale.
      expect(shopRepository.ensureUnmapped).toHaveBeenCalledWith(
        { code: '9999', regionId: 'region-unassigned' },
        tx,
      );
    });

    it('should warn, so an unmapped warehouse is visible in the logs', async () => {
      const { service } = buildService({ known: false });
      const logger = (service as unknown as { logger: { warn: jest.Mock } })
        .logger;

      await service.resolve('9999', tx);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('9999'));
    });
  });
});
