/**
 * Topic names are read from the environment at import time rather than through
 * AppConfigService, because `@EventPattern` needs its value while the consumer
 * class is being decorated — before DI exists.
 *
 * The BC names are still provisional: `bcProduct` carries the "загальний"
 * catalogue message and `bcStock` the quantities. Confirm them against what BC
 * actually produces before deploying.
 */
export const KAFKA_TOPICS = {
  bcProduct: process.env.KAFKA_TOPIC_BC_PRODUCT ?? 'bc.product.global',
  bcStock: process.env.KAFKA_TOPIC_BC_STOCK ?? 'bc.stock.unit',
  ecomStock: process.env.KAFKA_TOPIC_ECOM_STOCK ?? 'ecom.stock.updated',
} as const;
