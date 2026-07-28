import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { EcomService } from '../src/modules/ecom/ecom.service';
import { HealthController } from '../src/modules/health/health.controller';
import { HealthService } from '../src/modules/health/health.service';
import { StockService } from '../src/modules/stock/stock.service';
import { DatabaseService } from '../src/shared/database/database.service';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  const queryRaw = jest.fn();
  const countBlockedCalculations = jest.fn();
  const countStale = jest.fn();

  beforeEach(async () => {
    queryRaw.mockResolvedValue([{ 1: 1 }]);
    countBlockedCalculations.mockResolvedValue({ pending: 0, abandoned: 0 });
    countStale.mockResolvedValue(0);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: DatabaseService, useValue: { $queryRaw: queryRaw } },
        { provide: StockService, useValue: { countBlockedCalculations } },
        { provide: EcomService, useValue: { countStale } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports ok when the database answers and no calculation is blocked', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'up',
      reservations: {
        pendingRecalculations: 0,
        abandonedRecalculations: 0,
        staleQuantities: 0,
      },
    });
  });

  it('reports degraded when the database is unreachable', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));

    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'degraded',
      database: 'down',
    });
  });

  it('reports degraded once a calculation has been abandoned', async () => {
    countBlockedCalculations.mockResolvedValue({ pending: 4, abandoned: 1 });
    countStale.mockResolvedValue(2);

    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'degraded',
      database: 'up',
      reservations: {
        pendingRecalculations: 4,
        abandonedRecalculations: 1,
        staleQuantities: 2,
      },
    });
  });
});
