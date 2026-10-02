import { baseConfig } from '@roshd/eslint-config/base';

/**
 * ADR-0009: money and rates never touch binary floating point. All arithmetic goes through
 * `Decimal` (src/decimal.ts); these rules stop the usual ways a `number` sneaks in.
 */
const noFloatArithmetic = [
  {
    selector: "MemberExpression[object.name='Math']",
    message: 'Use Decimal, not Math (ADR-0009).',
  },
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: 'Parse with toDecimal() (ADR-0009).',
  },
  {
    selector: "CallExpression[callee.name='Number']",
    message: 'Parse with toDecimal() (ADR-0009).',
  },
  // Numeric literals with a fraction (0.1, 1.5e3); regex and string literals do not start with a digit.
  {
    selector: 'Literal[raw=/^\\d*\\.\\d/]',
    message: 'No decimal number literals; use decimal strings (ADR-0009).',
  },
];

export default [
  ...baseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: { 'no-restricted-syntax': ['error', ...noFloatArithmetic] },
  },
];
