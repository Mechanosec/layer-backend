import { StockCalculateService } from '../services/stock.calculate.service';

describe(StockCalculateService.name, () => {
  const service = new StockCalculateService();

  describe('calculate', () => {
    it('should subtract the safety buffer and NEW-order reservations from the shop total', () => {
      expect(
        service.calculate({ shopsTotal: 10, safetyBuffer: 2, reserved: 3 }),
      ).toEqual({
        shopsTotal: 10,
        safetyBuffer: 2,
        reserved: 3,
        quantity: 5,
      });
    });

    it('should never return a negative quantity', () => {
      const result = service.calculate({
        shopsTotal: 1,
        safetyBuffer: 5,
        reserved: 4,
      });

      expect(result.quantity).toBe(0);
    });

    it('should keep the inputs on the result so a published number can be explained', () => {
      const input = { shopsTotal: 7, safetyBuffer: 0, reserved: 0 };

      expect(service.calculate(input)).toMatchObject(input);
    });
  });
});
