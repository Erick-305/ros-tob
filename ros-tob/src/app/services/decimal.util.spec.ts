import { parseDecimal, roundMoney } from './decimal.util';

describe('decimal utilities', () => {
  it('parses comma decimal input', () => {
    expect(parseDecimal('12,50')).toBe(12.5);
  });

  it('rounds line and sale totals to cents', () => {
    const lineTotals = [0.1 * 3, 0.2].map(roundMoney);
    expect(lineTotals.reduce((total, amount) => total + amount, 0)).toBe(0.5);
    expect(roundMoney(1.005)).toBe(1.01);
  });
});
