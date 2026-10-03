import { toDecimal, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import type { CurrencyCode } from '../types';

/** Exchange rate per period for `currency` (1 for the local currency). */
export function ratesFor(
  currency: CurrencyCode,
  input: { localCurrency: CurrencyCode; exchangeRates: Record<CurrencyCode, DecimalString[]> },
  length: number,
  field: string,
): Decimal[] | undefined {
  if (currency === input.localCurrency) return undefined;
  const rates = Object.hasOwn(input.exchangeRates, currency)
    ? input.exchangeRates[currency]
    : undefined;
  if (rates === undefined) {
    throw new EngineInputError('model.exchangeRateMissing', field, { currency });
  }
  if (rates.length !== length) {
    throw new EngineInputError('series.lengthMismatch', `exchangeRates.${currency}`, {
      expected: String(length),
      actual: String(rates.length),
    });
  }
  return rates.map((r, j) => {
    const rate = toDecimal(r);
    if (!rate.gt(0)) {
      throw new EngineInputError('exchangeRate.notPositive', `exchangeRates.${currency}[${j}]`);
    }
    return rate;
  });
}
