# shared

## Purpose

Integrations and third-party clients. `SharedModule` is `@Global`, so feature
modules under `src/modules` inject them without repeating imports.

## Key responsibilities

- `config/` — the environment class, its validation, and `AppConfigService` as the
  only place that reads `process.env`. Deployment configuration only; tuning values
  are constants in each module's `constants` folder.
  `app.config.constants.ts` exists for the few places that run before DI (the pino
  transport choice, controller registration, Swagger gating).
- `database/` — `DatabaseService` (Prisma client via the `PrismaPg` driver adapter,
  required in Prisma 7), `BaseRepository` with the optional-`tx` helper, and the
  generic repository interfaces
- `ecom-api/` — reads reservations from e-com; never substitutes a fallback number,
  always throws `EcomApiUnavailableError` instead
- `kafka/` — the producer, `KafkaAdminService` (creates topics at boot, because
  broker-side auto-creation is lazy and a consumer subscribing to a missing topic
  is fatal in kafkajs), and topic constants read at import time
- `utils/` — `handleExceptionCode` (the shape every service's `catch` throws) and
  `describeError` (the log form, including the fields `JSON.stringify` drops on an
  `Error`)
- `constants/` — `http-exception-code.constant.ts`, the numeric domain codes carried
  on error responses
- `filters/` — maps the Prisma error codes we rely on onto HTTP responses
- `swagger/` — the document builder and the API tag enum

## Public API / Exports

- `AppConfigService`, `DatabaseService`, `EcomApiService`, `KafkaProducerService`

## Dependencies

- `@nestjs/config`, Prisma, kafkajs, nestjs-pino
