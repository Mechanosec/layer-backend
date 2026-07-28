import { PinoLogger } from 'nestjs-pino';

import {
  RecalculationTaskStatus,
  StockRecalculationTask,
} from '../../../generated/prisma/client';
import { StockRecalculationTaskRepository } from '../repositories/stock-recalculation-task.repository';
import { StockRecalculateService } from '../services/stock.recalculate.service';
import { StockRetryRecalculationService } from '../services/stock.retry-recalculation.service';
import { ERecalculationReason } from '../types/stock.type';

function buildTask(overrides: Partial<StockRecalculationTask> = {}) {
  return {
    id: 'task-1',
    variantId: 'variant-1',
    regionId: 'region-1',
    sku: '200202',
    variantCode: '000',
    regionCode: 'CENTRAL',
    status: RecalculationTaskStatus.PENDING,
    reason: ERecalculationReason.EcomUnavailable,
    attempts: 1,
    lastError: 'e-com is down',
    lastTriedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildService(tasks: StockRecalculationTask[]) {
  const logger = { info: jest.fn(), error: jest.fn() } as unknown as PinoLogger;

  const taskRepository = {
    findPending: jest.fn().mockResolvedValue(tasks),
    recordUnavailableReservations: jest.fn().mockResolvedValue({}),
  } as unknown as StockRecalculationTaskRepository;

  const recalculateService = {
    run: jest.fn().mockResolvedValue({ reservationsStale: false }),
  } as unknown as StockRecalculateService;

  const service = new StockRetryRecalculationService(
    logger,
    taskRepository,
    recalculateService,
  );

  return { service, taskRepository, recalculateService };
}

describe(StockRetryRecalculationService.name, () => {
  describe('retryPending', () => {
    it('should do nothing when the backlog is empty', async () => {
      const { service, recalculateService } = buildService([]);

      await expect(service.retryPending()).resolves.toBe(0);
      expect(recalculateService.run).not.toHaveBeenCalled();
    });

    it('should rebuild the target from the task and re-run the calculation', async () => {
      const { service, recalculateService } = buildService([buildTask()]);

      await expect(service.retryPending()).resolves.toBe(1);
      expect(recalculateService.run).toHaveBeenCalledWith({
        variantId: 'variant-1',
        regionId: 'region-1',
        sku: '200202',
        variantCode: '000',
        regionCode: 'CENTRAL',
      });
    });

    it('should not count a run that is still missing fresh reservations as recovered', async () => {
      const { service, recalculateService } = buildService([buildTask()]);
      (recalculateService.run as jest.Mock).mockResolvedValue({
        reservationsStale: true,
      });

      await expect(service.retryPending()).resolves.toBe(0);
    });

    it('should keep going after one task throws, and record the failure', async () => {
      const { service, taskRepository, recalculateService } = buildService([
        buildTask({ id: 'task-1', sku: 'A' }),
        buildTask({ id: 'task-2', sku: 'B' }),
      ]);
      (recalculateService.run as jest.Mock)
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValueOnce({ reservationsStale: false });

      await expect(service.retryPending()).resolves.toBe(1);
      expect(recalculateService.run).toHaveBeenCalledTimes(2);
      expect(taskRepository.recordUnavailableReservations).toHaveBeenCalledWith(
        expect.objectContaining({ sku: 'A' }),
        'connection reset',
        expect.any(Number),
      );
    });
  });
});
