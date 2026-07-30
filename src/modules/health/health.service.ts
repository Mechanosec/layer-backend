import { Injectable } from '@nestjs/common';

import { PinoLogger } from 'nestjs-pino';

import { DatabaseService } from '../../shared/database/database.service';
import { describeError } from '../../shared/utils/utils';
import { EcomService } from '../ecom/ecom.service';
import { StockService } from '../stock/stock.service';
import { HealthResponseDto } from './response/health.response.dto';

@Injectable()
export class HealthService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly database: DatabaseService,
    private readonly stockService: StockService,
    private readonly ecomService: EcomService,
  ) {}

  public async check(): Promise<HealthResponseDto> {
    let database: HealthResponseDto['database'] = 'up';

    try {
      await this.database.$queryRaw`SELECT 1`;
    } catch (error) {
      // Swallowed on purpose: an unreachable database is the answer this endpoint
      // exists to give, not a failure to report upward.
      this.logger.error(
        `[${HealthService.name}]Database check was failed` +
          ` with error: ${describeError(error)}`,
      );
      database = 'down';
    }

    if (database === 'down') {
      return {
        status: 'degraded',
        database,
        reservations: {
          pendingRecalculations: 0,
          abandonedRecalculations: 0,
          staleQuantities: 0,
        },
        uptimeSeconds: Math.round(process.uptime()),
      };
    }

    let blocked = { pending: 0, abandoned: 0 };
    let staleQuantities = 0;

    try {
      [blocked, staleQuantities] = await Promise.all([
        this.stockService.countBlockedCalculations(),
        this.ecomService.countStale(),
      ]);
    } catch (error) {
      // Same reason: /health must answer even when a count cannot be taken.
      this.logger.error(
        `[${HealthService.name}]Reading the backlog was failed` +
          ` with error: ${describeError(error)}`,
      );
    }

    return {
      // A backlog means published numbers may be out of date, which is worth
      // alerting on even though the service itself is serving traffic.
      status: blocked.abandoned > 0 ? 'degraded' : 'ok',
      database,
      reservations: {
        pendingRecalculations: blocked.pending,
        abandonedRecalculations: blocked.abandoned,
        staleQuantities,
      },
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
