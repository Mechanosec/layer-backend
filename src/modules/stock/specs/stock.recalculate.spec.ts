import { HttpException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';
import { EcomApiService } from '../../../shared/ecom-api/ecom-api.service';
import { EcomApiUnavailableError } from '../../../shared/ecom-api/errors/ecom-api.error';
import { EcomService } from '../../ecom/ecom.service';
import { EcomStockSnapshot } from '../../ecom/types/ecom.type';
import { RegionRepository } from '../repositories/region.repository';
import { ShopStockRepository } from '../repositories/shop-stock.repository';
import { StockRecalculationTaskRepository } from '../repositories/stock-recalculation-task.repository';
import { StockCalculateService } from '../services/stock.calculate.service';
import { StockRecalculateService } from '../services/stock.recalculate.service';

const TARGET = {
  variantId: 'variant-1',
  sku: '200202',
  variantCode: '000',
  regionId: 'region-1',
  regionCode: 'CENTRAL',
};

const PUBLISHED: EcomStockSnapshot = {
  quantity: 10,
  reserved: 3,
  reservationsStale: false,
  publishedQuantity: 10,
  publishedAt: new Date('2026-07-28T10:00:00Z'),
};

interface Options {
  /** Reserved units e-com reports; an Error instead makes the call fail. */
  reserved?: number | Error;
  /** What e-com was last told, or null when nothing was ever published. */
  current?: EcomStockSnapshot | null;
  shopsTotal?: number;
  safetyBuffer?: number;
}

function buildService(options: Options = {}) {
  const logger = { error: jest.fn(), warn: jest.fn() } as unknown as PinoLogger;

  const database = {
    $transaction: jest.fn(
      async (callback: (tx: TransactionClient) => Promise<unknown>) =>
        callback({} as TransactionClient),
    ),
  } as unknown as DatabaseService;

  const shopStockRepository = {
    sumForRegion: jest.fn().mockResolvedValue(options.shopsTotal ?? 12),
  } as unknown as ShopStockRepository;

  const regionRepository = {
    findSafetyBuffer: jest.fn().mockResolvedValue({
      safetyBuffer: options.safetyBuffer ?? 2,
      bcCode: 'CENTRAL',
    }),
  } as unknown as RegionRepository;

  const taskRepository = {
    recordUnavailableReservations: jest.fn().mockResolvedValue({}),
    markDone: jest.fn().mockResolvedValue(1),
  } as unknown as StockRecalculationTaskRepository;

  const reserved = options.reserved ?? 3;
  const ecomApiService = {
    getReservedQuantity:
      reserved instanceof Error
        ? jest.fn().mockRejectedValue(reserved)
        : jest.fn().mockResolvedValue(reserved),
  } as unknown as EcomApiService;

  const ecomService = {
    getCurrent: jest
      .fn()
      .mockResolvedValue(
        options.current === undefined ? PUBLISHED : options.current,
      ),
    saveCalculated: jest.fn().mockResolvedValue(undefined),
    enqueuePublication: jest.fn().mockResolvedValue(undefined),
    publishSoon: jest.fn(),
  } as unknown as EcomService;

  const service = new StockRecalculateService(
    logger,
    database,
    shopStockRepository,
    regionRepository,
    taskRepository,
    new StockCalculateService(),
    ecomApiService,
    ecomService,
  );

  return { service, taskRepository, ecomApiService, ecomService };
}

const unavailable = new EcomApiUnavailableError('e-com is down', 3);

describe(StockRecalculateService.name, () => {
  describe('run, with e-com answering', () => {
    it('should subtract the reservations e-com reported', async () => {
      const { service } = buildService({ reserved: 3 });

      // 12 in ecom-enabled shops - 2 safety buffer - 3 reserved
      await expect(service.run(TARGET)).resolves.toMatchObject({
        quantity: 7,
        shopsTotal: 12,
        safetyBuffer: 2,
        reserved: 3,
        regionCode: 'CENTRAL',
        reservationsStale: false,
        published: true,
      });
    });

    it('should ask e-com about the variant and region being calculated', async () => {
      const { service, ecomApiService } = buildService();

      await service.run(TARGET);

      expect(ecomApiService.getReservedQuantity).toHaveBeenCalledWith({
        sku: '200202',
        variantCode: '000',
        regionCode: 'CENTRAL',
      });
    });

    it('should queue the number for e-com and close the retry task', async () => {
      const { service, ecomService, taskRepository } = buildService();

      await service.run(TARGET);

      expect(ecomService.enqueuePublication).toHaveBeenCalledWith(
        TARGET,
        7,
        expect.anything(),
      );
      expect(ecomService.saveCalculated).toHaveBeenCalledWith(
        TARGET,
        expect.objectContaining({ quantity: 7 }),
        false,
        true,
        expect.anything(),
      );
      expect(taskRepository.markDone).toHaveBeenCalled();
    });
  });

  describe('run, with e-com unreachable', () => {
    it('should carry the last known reservations over instead of assuming zero', async () => {
      const { service } = buildService({ reserved: unavailable });

      // reserved falls back to the stored 3, not to 0
      await expect(service.run(TARGET)).resolves.toMatchObject({
        reserved: 3,
        quantity: 7,
        reservationsStale: true,
      });
    });

    it('should record a retry task and mark the stored value stale', async () => {
      const { service, taskRepository, ecomService } = buildService({
        reserved: unavailable,
      });

      await service.run(TARGET);

      expect(taskRepository.recordUnavailableReservations).toHaveBeenCalledWith(
        TARGET,
        expect.stringContaining('e-com is down'),
        expect.any(Number),
      );
      expect(ecomService.saveCalculated).toHaveBeenCalledWith(
        TARGET,
        expect.anything(),
        true,
        expect.any(Boolean),
        expect.anything(),
      );
      expect(taskRepository.markDone).not.toHaveBeenCalled();
    });

    it('should publish a stale result that lowers what e-com may sell', async () => {
      // Shop stock dropped to 6, so the number falls below the published 10.
      const { service, ecomService } = buildService({
        reserved: unavailable,
        shopsTotal: 6,
      });

      const result = await service.run(TARGET);

      expect(result.quantity).toBe(1);
      expect(result.published).toBe(true);
      expect(ecomService.enqueuePublication).toHaveBeenCalled();
    });

    it('should withhold a stale result that would raise what e-com may sell', async () => {
      // Shop stock jumped to 50, which on unconfirmed reservations could oversell.
      const { service, ecomService } = buildService({
        reserved: unavailable,
        shopsTotal: 50,
      });

      const result = await service.run(TARGET);

      expect(result.published).toBe(false);
      expect(ecomService.enqueuePublication).not.toHaveBeenCalled();
      // Still stored, so the stale number is visible and auditable.
      expect(ecomService.saveCalculated).toHaveBeenCalled();
    });

    it('should withhold anything when e-com has no published baseline yet', async () => {
      const { service, ecomService } = buildService({
        reserved: unavailable,
        current: null,
      });

      const result = await service.run(TARGET);

      expect(result.reserved).toBe(0);
      expect(result.published).toBe(false);
      expect(ecomService.enqueuePublication).not.toHaveBeenCalled();
    });

    it('should compare against what e-com holds, not against an earlier withheld result', async () => {
      // A previous stale run stored 39 without publishing it, so `quantity` is
      // 39 while e-com still holds 9. A drop to 1 must reach e-com even so.
      const { service, ecomService } = buildService({
        reserved: unavailable,
        shopsTotal: 7,
        current: {
          quantity: 39,
          reserved: 4,
          reservationsStale: true,
          publishedQuantity: 9,
          publishedAt: new Date('2026-07-28T10:00:00Z'),
        },
      });

      const result = await service.run(TARGET);

      expect(result.quantity).toBe(1);
      expect(result.published).toBe(true);
      expect(ecomService.enqueuePublication).toHaveBeenCalled();
    });
  });

  describe('run, with an unexpected failure', () => {
    it('should fail the run rather than degrade, when the cause is not an e-com outage', async () => {
      const { service, taskRepository } = buildService({
        reserved: new TypeError('boom'),
      });

      await expect(service.run(TARGET)).rejects.toThrow(HttpException);
      // Not treated as a missing-reservations case: no stale result, no retry task.
      expect(
        taskRepository.recordUnavailableReservations,
      ).not.toHaveBeenCalled();
    });

    it('should not leak the internal error to the caller', async () => {
      const { service } = buildService({
        reserved: new TypeError('column "foo" does not exist'),
      });

      // The caller gets the service's own message; the cause goes to the log.
      await expect(service.run(TARGET)).rejects.toThrow(
        /Recalculating 200202\/000 in CENTRAL was failed/,
      );
    });
  });
});
