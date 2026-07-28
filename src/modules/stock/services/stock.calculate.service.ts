import { Injectable } from '@nestjs/common';

import {
  StockCalculationInput,
  StockCalculationResult,
} from '../types/stock.type';

/**
 * MOCK IMPLEMENTATION — the formula is not settled yet.
 *
 * The manager's description is:
 *
 *   залишок в e-com = сума залишків в обраних магазинах регіона BC
 *                     - safety buffer
 *                     - кількість товарів доданих в ордери в статусі "Новий"
 *
 * which is what this returns, clamped at zero. Open questions to resolve before
 * it can be called final:
 *   - is safetyBuffer per region, per shop, or per variant?
 *   - do reservations count region-wide, or only within the same region's shops?
 *   - should a variant with stock only in non-selected shops read 0, or be hidden?
 *
 * Gathering the inputs is StockRecalculateService's job, so replacing the body
 * here is the only change needed once the rules are confirmed.
 */
@Injectable()
export class StockCalculateService {
  public calculate(input: StockCalculationInput): StockCalculationResult {
    const quantity = input.shopsTotal - input.safetyBuffer - input.reserved;

    return { ...input, quantity: Math.max(0, quantity) };
  }
}
