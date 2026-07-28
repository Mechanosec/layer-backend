/**
 * Topic names are read from the environment at import time rather than through
 * AppConfigService, because `@EventPattern` needs its value while the consumer
 * class is being decorated — before DI exists.
 */
export const KAFKA_TOPICS = {
  bcStockGlobal: process.env.KAFKA_TOPIC_BC_STOCK_GLOBAL ?? 'bc.stock.global',
  bcStockUnit: process.env.KAFKA_TOPIC_BC_STOCK_UNIT ?? 'bc.stock.unit',
  ecomStock: process.env.KAFKA_TOPIC_ECOM_STOCK ?? 'ecom.stock.updated',
} as const;
