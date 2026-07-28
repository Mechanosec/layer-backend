import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../config/app-config.service';
import { ECOM_API } from './constants/ecom-api.constants';
import { EcomReservationResponseDto } from './dto/ecom-reservation.response.dto';
import { EcomApiUnavailableError } from './errors/ecom-api.error';
import { ReservationQuery } from './types/ecom-api.type';

/**
 * Reads reservations from e-com. This is the one term of the stock formula layer
 * does not own: orders live in e-com, so the number is fetched at calculation
 * time.
 *
 * Every failure mode — timeout, non-2xx, unparseable or invalid body — surfaces
 * as EcomApiUnavailableError. The service never substitutes a fallback number,
 * because a wrong `reserved` overstates stock and invites overselling; deciding
 * what to do without it belongs to the caller.
 */
@Injectable()
export class EcomApiService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly appConfigService: AppConfigService,
  ) {}

  public async getReservedQuantity(query: ReservationQuery): Promise<number> {
    const url = this.buildUrl(query);
    const attempts = ECOM_API.RETRIES + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.request(url);
      } catch (error) {
        lastError = error;

        this.logger.warn(
          `[${EcomApiService.name}]Attempt ${attempt}/${attempts} to read reservations for ${query.sku}/${query.variantCode} failed with error: ${describe(error)}`,
        );

        if (attempt < attempts) {
          await delay(ECOM_API.RETRY_DELAY_MS * attempt);
        }
      }
    }

    throw new EcomApiUnavailableError(
      `e-com did not return reservations for ${query.sku}/${query.variantCode} after ${attempts} attempt(s): ${describe(lastError)}`,
      attempts,
      lastError,
    );
  }

  private async request(url: string): Promise<number> {
    const token = this.appConfigService.ecomApiToken;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(ECOM_API.TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const body: unknown = await response.json();
    const dto = plainToInstance(EcomReservationResponseDto, body, {
      enableImplicitConversion: true,
    });
    const errors = validateSync(dto, { forbidUnknownValues: false });

    if (errors.length > 0) {
      const details = errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('; ');

      throw new Error(`unexpected response body: ${details}`);
    }

    return dto.reserved;
  }

  private buildUrl(query: ReservationQuery): string {
    const url = new URL(
      ECOM_API.RESERVATIONS_PATH,
      this.appConfigService.ecomApiUrl,
    );

    url.searchParams.set('sku', query.sku);
    url.searchParams.set('variantCode', query.variantCode);
    url.searchParams.set('regionCode', query.regionCode);

    return url.toString();
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    // AbortSignal.timeout raises a TimeoutError with an unhelpful message.
    return error.name === 'TimeoutError' ? 'request timed out' : error.message;
  }

  return JSON.stringify(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
