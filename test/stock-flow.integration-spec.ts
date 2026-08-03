import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';

import { BcEventsModule } from '../src/modules/bc-events/bc-events.module';
import { BcEventsService } from '../src/modules/bc-events/bc-events.service';
import { EIngestOutcome } from '../src/modules/bc-events/types/bc-events.type';
import { EcomModule } from '../src/modules/ecom/ecom.module';
import { EcomService } from '../src/modules/ecom/ecom.service';
import { StockModule } from '../src/modules/stock/stock.module';
import {
  BcEventStatus,
  OutboxStatus,
  RecalculationTaskStatus,
} from '../src/generated/prisma/client';
import { validateEnvironmentConfig } from '../src/shared/config/environment.validation';
import { DatabaseService } from '../src/shared/database/database.service';
import { KafkaAdminService } from '../src/shared/kafka/kafka-admin.service';
import { KafkaProducerService } from '../src/shared/kafka/kafka-producer.service';
import { SharedModule } from '../src/shared/shared.module';
import { KafkaMessageMeta } from '../src/shared/kafka/types/kafka.type';

const MOCK_ECOM_PORT = 4321;
const MOCK_ECOM_URL = `http://localhost:${MOCK_ECOM_PORT}`;

/**
 * The whole pipeline against real infrastructure: a throwaway Postgres from
 * Testcontainers (migrated and seeded like a deployment) and the repository's
 * own mock e-com answering over real HTTP. The only stub is the Kafka
 * producer — it records what would have been published instead of needing a
 * broker; ingest is driven through BcEventsService, which is exactly what the
 * Kafka controller calls after unwrapping a message.
 *
 * Seeded reference data used throughout (prisma/seed.ts): region CENTRAL
 * (safetyBuffer 2) with shops 0119/0120 included in e-com and 0121 excluded.
 */
describe('Stock pipeline (integration)', () => {
  let moduleRef: TestingModule;
  let bcEvents: BcEventsService;
  let ecom: EcomService;
  let db: DatabaseService;
  let mockEcom: ChildProcess;

  const published: { topic: string; key: string; value: unknown }[] = [];
  const producerStub = {
    publish: (topic: string, messages: { key: string; value: unknown }[]) => {
      published.push(...messages.map((message) => ({ topic, ...message })));
      return Promise.resolve([]);
    },
  };

  let offset = 0;
  const meta = (): KafkaMessageMeta => ({
    topic: 'bc.stock.unit',
    partition: 0,
    offset: String(++offset),
    key: 'test',
  });

  const setEcomState = async (patch: {
    reserved?: number;
    mode?: string;
  }): Promise<void> => {
    const response = await fetch(`${MOCK_ECOM_URL}/_state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });

    expect(response.ok).toBe(true);
  };

  const lastPublished = () => published[published.length - 1];

  /**
   * Recalculation fires a background outbox drain (publishSoon), and an explicit
   * publishPending() yields to a drain already in flight — so the only reliable
   * "everything published" signal is the outbox running out of PENDING rows.
   */
  const drainOutbox = async (): Promise<void> => {
    for (let attempt = 0; attempt < 50; attempt++) {
      await ecom.publishPending();

      const pending = await db.ecomStockOutbox.count({
        where: { status: OutboxStatus.PENDING },
      });

      if (pending === 0) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('outbox still has PENDING rows');
  };

  beforeAll(async () => {
    mockEcom = spawn(
      'node',
      [join(__dirname, '..', 'tools', 'mock-ecom.mjs')],
      {
        env: { ...process.env, MOCK_ECOM_PORT: String(MOCK_ECOM_PORT) },
        stdio: 'ignore',
      },
    );
    await waitForMockEcom();

    process.env.ECOM_API_URL = MOCK_ECOM_URL;

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          validate: validateEnvironmentConfig,
        }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        SharedModule,
        StockModule,
        EcomModule,
        BcEventsModule,
      ],
    })
      // The two broker clients are the only stubs: their onModuleInit would
      // dial a real Kafka. The producer stub records outgoing messages so the
      // publication can still be asserted.
      .overrideProvider(KafkaProducerService)
      .useValue(producerStub)
      .overrideProvider(KafkaAdminService)
      .useValue({})
      .compile();

    await moduleRef.init();

    bcEvents = moduleRef.get(BcEventsService);
    ecom = moduleRef.get(EcomService);
    db = moduleRef.get(DatabaseService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    mockEcom?.kill();
  });

  async function waitForMockEcom(): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        await fetch(`${MOCK_ECOM_URL}/_state`);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    throw new Error('mock e-com did not come up');
  }

  it('applies a catalogue message: product and variants land in the database', async () => {
    const outcome = await bcEvents.ingestProduct(
      {
        sku: '200202',
        name: 'Кросівки бігові',
        brand: 'Test Brand',
        unitMeasure: 'ПАР',
        price: 2699,
        variants: [
          {
            variantCode: '000',
            barcodeNo: '770662476000',
            color: 'чорний',
            size: '42',
          },
          {
            variantCode: '001',
            barcodeNo: '770662476001',
            color: 'чорний',
            size: '43',
          },
        ],
      },
      meta(),
    );

    expect(outcome).toBe(EIngestOutcome.Processed);

    const product = await db.product.findUnique({
      where: { sku: '200202' },
      include: { variants: true },
    });

    expect(product?.name).toBe('Кросівки бігові');
    expect(product?.variants).toHaveLength(2);

    const event = await db.bcEvent.findFirst({
      orderBy: { receivedAt: 'desc' },
    });
    expect(event?.status).toBe(BcEventStatus.PROCESSED);
  });

  it('applies stock, calculates the region quantity and publishes it', async () => {
    await setEcomState({ mode: 'ok', reserved: 1 });

    const outcome = await bcEvents.ingestStock(
      {
        sku: '200202',
        variants: [
          {
            variantCode: '000',
            warehouses: [
              { warehouseCode: '0119', quantity: 5 },
              { warehouseCode: '0120', quantity: 4 },
              // Excluded from e-com by the seed: stored, never counted.
              { warehouseCode: '0121', quantity: 50 },
            ],
          },
        ],
      },
      meta(),
    );

    expect(outcome).toBe(EIngestOutcome.Processed);

    const variant = await db.productVariant.findUnique({
      where: { sku_variantCode: { sku: '200202', variantCode: '000' } },
      include: { stocks: true, ecomStocks: true },
    });

    expect(variant?.stocks).toHaveLength(3);

    // shopsTotal 9 (5 + 4, excluded shop's 50 not counted) - buffer 2 - reserved 1
    const ecomStock = variant?.ecomStocks[0];
    expect(ecomStock).toMatchObject({
      quantity: 6,
      shopsTotal: 9,
      safetyBuffer: 2,
      reserved: 1,
      reservationsStale: false,
      publishedQuantity: 6,
    });

    await drainOutbox();

    expect(lastPublished()).toMatchObject({
      topic: 'ecom.stock.updated',
      value: expect.objectContaining({
        sku: '200202',
        variantCode: '000',
        regionCode: 'CENTRAL',
        quantity: 6,
      }),
    });

    const outbox = await db.ecomStockOutbox.findFirst();
    expect(outbox?.status).toBe(OutboxStatus.SENT);
  });

  it('treats a redelivered message as a duplicate and does not apply it twice', async () => {
    const redelivered = { ...meta(), offset: '1' };
    const outcome = await bcEvents.ingestStock(
      {
        sku: '200202',
        variants: [
          {
            variantCode: '000',
            warehouses: [{ warehouseCode: '0119', quantityDelta: -5 }],
          },
        ],
      },
      redelivered,
    );

    expect(outcome).toBe(EIngestOutcome.Duplicate);

    const stock = await db.shopStock.findFirst({
      where: {
        shopCode: '0119',
        variant: { sku: '200202', variantCode: '000' },
      },
    });
    expect(stock?.quantity).toBe(5);
  });

  it('carries the last reservations over when e-com is down, and still publishes a drop', async () => {
    await setEcomState({ mode: 'down' });

    const outcome = await bcEvents.ingestStock(
      {
        sku: '200202',
        variants: [
          {
            variantCode: '000',
            warehouses: [{ warehouseCode: '0119', quantityDelta: -2 }],
          },
        ],
      },
      meta(),
    );

    // The event is applied and committed; only the calculation degrades.
    expect(outcome).toBe(EIngestOutcome.Processed);

    const ecomStock = await db.ecomStock.findFirst({
      where: { variant: { sku: '200202', variantCode: '000' } },
    });

    // shopsTotal 7 (3 + 4) - buffer 2 - carried-over reserved 1 = 4: lower than
    // the published 6, so the drop still reaches e-com (overselling protection).
    expect(ecomStock).toMatchObject({
      quantity: 4,
      reserved: 1,
      reservationsStale: true,
      publishedQuantity: 4,
    });

    await drainOutbox();
    expect(lastPublished().value).toMatchObject({ quantity: 4 });

    // The pair stays owned by the retry worker until reservations are fresh.
    const task = await db.stockRecalculationTask.findFirst({
      where: { sku: '200202', variantCode: '000' },
    });
    expect(task?.status).toBe(RecalculationTaskStatus.PENDING);
    expect(task?.attempts).toBeGreaterThan(0);
  });

  it('withholds a stale increase instead of raising what e-com may sell', async () => {
    await setEcomState({ mode: 'down' });
    const outboxRowsBefore = await db.ecomStockOutbox.count();

    await bcEvents.ingestStock(
      {
        sku: '200202',
        variants: [
          {
            variantCode: '000',
            warehouses: [{ warehouseCode: '0119', quantityDelta: 10 }],
          },
        ],
      },
      meta(),
    );

    const ecomStock = await db.ecomStock.findFirst({
      where: { variant: { sku: '200202', variantCode: '000' } },
    });

    // shopsTotal 17 - 2 - 1 = 14 > published 4: computed and stored, withheld
    // from publication until e-com confirms the reservations.
    expect(ecomStock).toMatchObject({
      quantity: 14,
      reservationsStale: true,
      publishedQuantity: 4,
    });

    expect(await db.ecomStockOutbox.count()).toBe(outboxRowsBefore);
  });

  it('publishes the withheld quantity once e-com answers again', async () => {
    await setEcomState({ mode: 'ok', reserved: 1 });

    await bcEvents.ingestStock(
      {
        sku: '200202',
        variants: [
          {
            variantCode: '000',
            warehouses: [{ warehouseCode: '0119', quantityDelta: 0 }],
          },
        ],
      },
      meta(),
    );

    const ecomStock = await db.ecomStock.findFirst({
      where: { variant: { sku: '200202', variantCode: '000' } },
    });

    expect(ecomStock).toMatchObject({
      quantity: 14,
      reservationsStale: false,
      publishedQuantity: 14,
    });

    await drainOutbox();
    expect(lastPublished().value).toMatchObject({ quantity: 14 });

    const task = await db.stockRecalculationTask.findFirst({
      where: { sku: '200202', variantCode: '000' },
    });
    expect(task?.status).toBe(RecalculationTaskStatus.DONE);
  });

  it('creates an unmapped warehouse excluded from e-com in the UNASSIGNED region', async () => {
    await bcEvents.ingestStock(
      {
        sku: '200202',
        variants: [
          {
            variantCode: '001',
            warehouses: [{ warehouseCode: '9999', quantity: 8 }],
          },
        ],
      },
      meta(),
    );

    const shop = await db.shop.findUnique({
      where: { code: '9999' },
      include: { region: true },
    });

    expect(shop?.includedInEcom).toBe(false);
    expect(shop?.region.bcCode).toBe('UNASSIGNED');

    // Stored for when the mapping arrives, but never offered for sale.
    const ecomStock = await db.ecomStock.findFirst({
      where: { variant: { sku: '200202', variantCode: '001' } },
    });
    expect(ecomStock?.quantity).toBe(0);
  });

  it('parks a line with neither quantity nor delta as FAILED instead of zeroing a warehouse', async () => {
    const rejected = meta();
    const outcome = await bcEvents.ingestStock(
      {
        sku: '200202',
        variants: [
          { variantCode: '000', warehouses: [{ warehouseCode: '0119' }] },
        ],
      },
      rejected,
    );

    expect(outcome).toBe(EIngestOutcome.Failed);

    const event = await db.bcEvent.findUnique({
      where: {
        topic_partition_offset: {
          topic: rejected.topic,
          partition: rejected.partition,
          offset: BigInt(rejected.offset),
        },
      },
    });
    expect(event?.status).toBe(BcEventStatus.FAILED);
    expect(event?.error).toContain('neither quantity nor quantityDelta');

    // The warehouse kept its stock — the line was rejected, not read as zero.
    const stock = await db.shopStock.findFirst({
      where: {
        shopCode: '0119',
        variant: { sku: '200202', variantCode: '000' },
      },
    });
    expect(stock?.quantity).toBe(13);
  });
});
