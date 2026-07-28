import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { EnvironmentVariables } from './environment.config';

/**
 * Fails fast at boot when the environment is incomplete, and hands the parsed
 * (and type-converted) values back to ConfigModule so `ConfigService.get`
 * returns numbers and booleans rather than strings.
 */
export function validateEnvironmentConfig(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');

    throw new Error(`.env file validation error: ${details}`);
  }

  return parsed;
}
