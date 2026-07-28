import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export enum EEnvironment {
  Local = 'local',
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Only what genuinely differs between environments: addresses, credentials and
 * switches. Tuning values (timeouts, retry counts, batch sizes) are constants
 * next to the code that uses them, not deployment configuration.
 */
export class EnvironmentVariables {
  // Runtime params
  @IsOptional()
  @IsEnum(EEnvironment)
  NODE_ENV: EEnvironment = EEnvironment.Development;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  LOG_LEVEL = 'info';

  // Database
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // Kafka
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  KAFKA_CLIENT_ID = 'layer-backend';

  /** Comma-separated broker list. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  KAFKA_BROKERS = 'localhost:9092';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  KAFKA_CONSUMER_GROUP = 'layer-backend';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  KAFKA_TOPIC_BC_STOCK_GLOBAL = 'bc.stock.global';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  KAFKA_TOPIC_BC_STOCK_UNIT = 'bc.stock.unit';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  KAFKA_TOPIC_ECOM_STOCK = 'ecom.stock.updated';

  // E-com API — the source of order reservations.
  @IsUrl({ require_tld: false })
  ECOM_API_URL!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ECOM_API_TOKEN?: string;

  /**
   * Comma-separated origins allowed to call the API — the visualiser needs it.
   * `*` is accepted for local demos; do not use it in production.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS = 'http://localhost:5173';

  // Swagger
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SWAGGER_PATH = 'docs';
}
