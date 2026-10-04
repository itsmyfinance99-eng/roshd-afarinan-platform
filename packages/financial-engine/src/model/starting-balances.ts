import { ZERO, toDecimal, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import { uniqueKeys } from './investment';

/**
 * Starting balances of an existing enterprise (manual VII.T, XI.F, XI.K–M; comfar-model-spec
 * §4.14): what the enterprise owns and owes on the day before the first project period, for an
 * expansion or rehabilitation project. Every amount is entered by the user; nothing has a default.
 *
 * Amounts are in local currency, as in COMFAR's STARTING BALANCE window, except the balance of a
 * loan, which is in the loan's own currency. The entries need not balance: the difference between
 * assets and liabilities is carried into the project as reserves (retained profit) or, when
 * negative, as accumulated losses.
 */
export interface StartingBalances {
  /** Book value of the existing assets of a fixed-investment or pre-production item. */
  fixedAssets: { item: string; value: DecimalString }[];
  /** Stock of a material cost item (raw materials … spare parts), by value. */
  materials: { cost: string; value: DecimalString }[];
  workInProgress: { product: string; value: DecimalString }[];
  /** Stock of finished products: quantity and the price it is valued at. */
  finishedProducts: { product: string; quantity: DecimalString; price: DecimalString }[];
  /** Accounts receivable, collected `collectionDays` (30/360) after the start of the project. */
  receivables: { value: DecimalString; collectionDays: number };
  /** Accounts payable, paid `paymentDays` (30/360) after the start of the project. */
  payables: { value: DecimalString; paymentDays: number };
  cashInHand: DecimalString;
  shortTermDeposits: DecimalString;
  /** Cash at bank beyond the cash-in-hand: the opening balance of the cash flow. */
  cashSurplus: DecimalString;
  /** Outstanding balance of an existing loan, in the loan's currency. */
  loans: { loan: string; balance: DecimalString }[];
  /** Equity of the existing enterprise held by a contribution (shareholder class). */
  equity: { equity: string; value: DecimalString }[];
}

/** The part of the starting balances each schedule needs. */
export type InvestmentStartingBalances = Pick<StartingBalances, 'fixedAssets'>;
export type FinancingStartingBalances = Pick<StartingBalances, 'loans' | 'equity'>;
export type OperationsStartingBalances = Pick<
  StartingBalances,
  | 'materials'
  | 'workInProgress'
  | 'finishedProducts'
  | 'receivables'
  | 'payables'
  | 'cashInHand'
  | 'shortTermDeposits'
>;

/** Parses an amount of a starting balance; a negative amount is refused. */
export function startingAmount(value: DecimalString, field: string): Decimal {
  const parsed = toDecimal(value);
  if (parsed.isNegative() && !parsed.isZero()) throw new EngineInputError('amount.negative', field);
  return parsed;
}

/**
 * Starting balances by the key of the item they belong to. A key used twice and a key that names
 * no item are refused, so every balance can be traced to one input.
 */
export function startingByKey<T, V>(
  entries: T[] | undefined,
  field: string,
  property: string,
  keyOf: (entry: T) => string,
  known: (key: string) => boolean,
  parse: (entry: T, field: string) => V,
): Map<string, V> {
  const list = entries ?? [];
  uniqueKeys(list.map(keyOf), field, property);
  return new Map(
    list.map((entry, i) => {
      const key = keyOf(entry);
      if (!known(key)) {
        throw new EngineInputError('startingBalance.unknownItem', `${field}[${i}].${property}`);
      }
      return [key, parse(entry, `${field}[${i}]`)] as const;
    }),
  );
}

/** Days after the start of the project on which a starting receivable or payable is settled. */
export function settlementDays(days: number, field: string): number {
  if (!Number.isInteger(days) || days < 0 || days > 36_000) {
    throw new EngineInputError('startingBalance.days', field);
  }
  return days;
}

/**
 * Outstanding amount at the end of each period of a starting receivable or payable that is settled
 * on day `days`: it stays in full until the period that contains that day (the first period for
 * day 0). A day beyond the horizon leaves it outstanding; it is then liquidated with the working
 * capital.
 */
export function outstanding(value: Decimal, days: number, periodEndDays: number[]): Decimal[] {
  return periodEndDays.map((end) => (end < days ? value : ZERO));
}
