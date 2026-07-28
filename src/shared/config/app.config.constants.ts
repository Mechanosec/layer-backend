import { EEnvironment } from './environment.config';

/**
 * Read straight from `process.env` for the places that run before DI exists —
 * the pino transport choice in app.module.ts, controller registration in
 * bc-events.module.ts, and Swagger gating in main.ts.
 */
export const environment =
  (process.env.NODE_ENV as EEnvironment | undefined) ??
  EEnvironment.Development;

export const isProduction = environment === EEnvironment.Production;
