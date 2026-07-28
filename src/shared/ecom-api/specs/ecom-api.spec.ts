import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { EcomApiService } from '../ecom-api.service';
import { EcomApiUnavailableError } from '../errors/ecom-api.error';

const QUERY = { sku: '200202', variantCode: '000', regionCode: 'CENTRAL' };

function buildService() {
  const logger = { warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger;
  const appConfigService = {
    ecomApiUrl: 'http://ecom.test',
    ecomApiToken: undefined,
  } as unknown as AppConfigService;

  return new EcomApiService(logger, appConfigService);
}

function respondWith(body: unknown, status = 200): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'stubbed',
    json: () => Promise.resolve(body),
  });
}

describe(EcomApiService.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getReservedQuantity', () => {
    it('should return the reserved quantity e-com reported', async () => {
      respondWith({ sku: '200202', variantCode: '000', reserved: 4 });

      await expect(buildService().getReservedQuantity(QUERY)).resolves.toBe(4);
    });

    it('should accept a genuine zero', async () => {
      respondWith({ reserved: 0 });

      await expect(buildService().getReservedQuantity(QUERY)).resolves.toBe(0);
    });

    /**
     * The whole safety property of this service is that an e-com that cannot
     * answer is never read as "nothing is reserved". Anything that coerces to a
     * clean 0 and passes validation defeats it silently, so each of these must
     * throw rather than return.
     */
    describe.each([
      ['an empty string', { reserved: '' }],
      ['a boolean', { reserved: false }],
      ['a numeric string', { reserved: '7' }],
      ['null', { reserved: null }],
      ['a missing field', {}],
      ['a renamed field', { count: 5 }],
      ['a negative number', { reserved: -3 }],
      ['a fraction', { reserved: 2.5 }],
      ['an array', [{ reserved: 4 }]],
      ['a bare number', 4],
      ['null itself', null],
    ])('given %s instead of an integer', (_label, body) => {
      it('should refuse to guess and report e-com as unavailable', async () => {
        respondWith(body);

        await expect(buildService().getReservedQuantity(QUERY)).rejects.toThrow(
          EcomApiUnavailableError,
        );
      });
    });

    it('should report a non-2xx response as unavailable', async () => {
      respondWith({ reserved: 4 }, 503);

      await expect(buildService().getReservedQuantity(QUERY)).rejects.toThrow(
        EcomApiUnavailableError,
      );
    });

    it('should report a transport failure as unavailable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('socket hang up'));

      await expect(buildService().getReservedQuantity(QUERY)).rejects.toThrow(
        EcomApiUnavailableError,
      );
    });

    it('should ask about the variant and region being calculated', async () => {
      respondWith({ reserved: 1 });

      await buildService().getReservedQuantity(QUERY);

      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('sku=200202');
      expect(url).toContain('variantCode=000');
      expect(url).toContain('regionCode=CENTRAL');
    });
  });
});
