import { PinoLogger } from 'nestjs-pino';

import { BcEventType } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../shared/database/database.service';
import { TransactionClient } from '../../../shared/database/types/database.type';
import { StockService } from '../../stock/stock.service';
import { BcUnitStockEventDto } from '../dto/bc-unit-stock-event.dto';
import { BcEventRepository } from '../repositories/bc-event.repository';
import { BcEventsIngestService } from '../services/bc-events.ingest.service';
import { EIngestOutcome } from '../types/bc-events.type';

const META = {
  topic: 'bc.stock.unit',
  partition: 0,
  offset: '42',
  key: '200202:000',
};

const VALID_PAYLOAD = {
  sku: '200202',
  variantCode: '000',
  shopCode: '0119',
  quantityDelta: 10,
};

const TARGET = {
  variantId: 'variant-1',
  sku: '200202',
  variantCode: '000',
  regionId: 'region-1',
  regionCode: 'CENTRAL',
};

function buildService(overrides: { isNew?: boolean } = {}) {
  const logger = {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;

  const database = {
    // Run the callback immediately with a stub transaction client.
    $transaction: jest.fn(
      async (callback: (tx: TransactionClient) => Promise<unknown>) =>
        callback({} as TransactionClient),
    ),
  } as unknown as DatabaseService;

  const eventRepository = {
    record: jest.fn().mockResolvedValue(overrides.isNew ?? true),
    markProcessed: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as BcEventRepository;

  const stockService = {
    tryRecalculate: jest.fn().mockResolvedValue(undefined),
  } as unknown as StockService;

  const service = new BcEventsIngestService(
    logger,
    database,
    eventRepository,
    stockService,
  );

  return { service, eventRepository, stockService };
}

const apply = jest.fn().mockResolvedValue(TARGET);

describe(BcEventsIngestService.name, () => {
  beforeEach(() => {
    apply.mockClear();
  });

  describe('ingest', () => {
    it('should apply a valid event and then recalculate outside the transaction', async () => {
      const { service, eventRepository, stockService } = buildService();

      const outcome = await service.ingest(
        BcEventType.UNIT,
        BcUnitStockEventDto,
        VALID_PAYLOAD,
        META,
        apply,
      );

      expect(outcome).toBe(EIngestOutcome.Processed);
      expect(apply).toHaveBeenCalled();
      expect(eventRepository.markProcessed).toHaveBeenCalled();
      expect(stockService.tryRecalculate).toHaveBeenCalledWith(TARGET);
    });

    it('should skip a message whose offset is already in the inbox', async () => {
      const { service, stockService } = buildService({ isNew: false });

      const outcome = await service.ingest(
        BcEventType.UNIT,
        BcUnitStockEventDto,
        VALID_PAYLOAD,
        META,
        apply,
      );

      expect(outcome).toBe(EIngestOutcome.Duplicate);
      expect(apply).not.toHaveBeenCalled();
      expect(stockService.tryRecalculate).not.toHaveBeenCalled();
    });

    it('should park a malformed payload instead of applying it', async () => {
      const { service, eventRepository } = buildService();

      const outcome = await service.ingest(
        BcEventType.UNIT,
        BcUnitStockEventDto,
        { sku: '200202' },
        META,
        apply,
      );

      expect(outcome).toBe(EIngestOutcome.Invalid);
      expect(apply).not.toHaveBeenCalled();
      expect(eventRepository.markFailed).toHaveBeenCalledWith(
        META,
        expect.stringContaining('shopCode'),
      );
    });

    it('should park an event that cannot be applied, without rethrowing', async () => {
      const { service, eventRepository, stockService } = buildService();
      const failing = jest.fn().mockRejectedValue(new Error('deadlock'));

      const outcome = await service.ingest(
        BcEventType.UNIT,
        BcUnitStockEventDto,
        VALID_PAYLOAD,
        META,
        failing,
      );

      expect(outcome).toBe(EIngestOutcome.Failed);
      expect(eventRepository.markFailed).toHaveBeenCalledWith(META, 'deadlock');
      expect(stockService.tryRecalculate).not.toHaveBeenCalled();
    });
  });
});
