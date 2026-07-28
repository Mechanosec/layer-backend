import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../shared/database/database.service';
import { EcomService } from '../ecom/ecom.service';
import { StockService } from '../stock/stock.service';
import { HealthResponseDto } from './response/health.response.dto';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly stockService: StockService,
    private readonly ecomService: EcomService,
  ) {}

  public async check(): Promise<HealthResponseDto> {
    let database: HealthResponseDto['database'] = 'up';

    try {
      await this.database.$queryRaw`SELECT 1`;
    } catch {
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

    const [blocked, staleQuantities] = await Promise.all([
      this.stockService.countBlockedCalculations(),
      this.ecomService.countStale(),
    ]);

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
