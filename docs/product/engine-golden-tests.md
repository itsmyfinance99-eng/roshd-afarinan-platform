# Financial engine: golden tests

- Story: ST-33.07 (EPIC-33)
- Code: `packages/financial-engine/src/golden/` (cases and runner), `packages/financial-engine/golden/` (reference implementation and expected values), `packages/financial-engine/browser/` (browser run)

The golden suite pins the results of `@roshd/financial-engine` to values computed **independently** of the engine and proves that the engine gives the **same output in Node and in a browser**. It complements the unit tests next to each module, which cover edge cases and invalid input.

## Fixtures

Every case calls one engine function with fixed input. The amounts are in rials at realistic magnitudes (up to 10^13) to exercise the 34-digit decimal arithmetic. The cases are constructed for testing; they are **not** real projects or real figures.

| Case                        | Function                  | What it covers                                                                       |
| --------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `npv-textbook`              | `npv`                     | the textbook series −100, 60, 60 at 10 %                                             |
| `npv-project`               | `npv`                     | sample project (2 construction + 5 production + salvage year), COMFAR reference date |
| `npv-rate-path`             | `npv`                     | half-year periods, a discount-rate path                                              |
| `irr-project`               | `irr`                     | sample project with salvage value                                                    |
| `irr-uneven`                | `irr`                     | quarterly construction periods                                                       |
| `mirr-project`              | `mirr`                    | separate reinvestment and borrowing rates, COMFAR reference date                     |
| `payback-project`           | `paybackPeriod`           | period, date and interpolated duration                                               |
| `dynamic-payback-project`   | `discountedPaybackPeriod` | the same on present values (12 %; at 18 % the project never pays back)               |
| `npvr-project`              | `npvRatio`                | NPV / PVI with working-capital release in the salvage year                           |
| `bcr`                       | `benefitCostRatio`        | present values of benefits and costs                                                 |
| `break-even`                | `breakEven`               | with and without costs of finance, two products at the planned mix                   |
| `product-break-even`        | `productBreakEven`        | constant-price and constant-volume analysis                                          |
| `dscr`                      | `debtServiceCoverage`     | four years, one without debt service, the minimum                                    |
| `llcr`                      | `loanLifeCoverage`        | rate path, debt ending before the horizon                                            |
| `wacc`                      | `wacc`                    | equity and two loans after tax                                                       |
| `depreciation-linear-scrap` | `depreciationSchedule`    | life in years and months, partial first year, scrap value                            |
| `depreciation-declining`    | `depreciationSchedule`    | declining balance with the switch to linear, partial first year                      |
| `depreciation-syd`          | `depreciationSchedule`    | sum of years digits with extra months and a partial first year                       |
| `escalation`                | `priceEscalationFactors`  | inflation path, escalation and the first-year escalator                              |
| `exchange-rates`            | `derivedExchangeRates`    | exchange-rate path from relative inflation                                           |
| `loan-annuity`              | `loanSchedule`            | quarterly annuity, rate path, interest capitalised in construction, three fee types  |
| `loan-constant-principal`   | `loanSchedule`            | half-yearly, half of the interest capitalised, guarantee fee                         |
| `loan-profile`              | `loanSchedule`            | irregular repayments, interest month, rate change, interest after the last due date  |

## Control method

`golden/reference.py` is a second implementation written from the COMFAR manual's formulas as restated in [comfar-model-spec.md](comfar-model-spec.md), not from the TypeScript code. Where possible it also computes differently:

- exact rational arithmetic (`fractions.Fraction`); fractional powers with 60-digit `decimal`;
- loans simulated **day by day** (the engine jumps from event to event);
- sum of years digits spread **month by month** (the engine shifts by overlapping intervals);
- linear depreciation in the manual's `M = integral part of …` form (the engine caps cumulative charges);
- IRR by plain bisection (the engine scans a grid first).

Every expected value is rounded half-even to 12 decimal places, and the Node test (`src/golden/golden.test.ts`) compares the engine's value rounded the same way: the match must be exact at that scale. When a formula or a COMFAR convention changes on purpose, both implementations change, `MODEL_VERSION` is bumped and the expected values are regenerated:

```bash
python packages/financial-engine/golden/reference.py
```

```bash
pnpm exec prettier --write packages/financial-engine/golden/expected.json
```

Expected values are never produced by running the engine itself.

## Node and browser

`browser/golden.spec.ts` (Playwright, part of `pnpm test:e2e`) bundles the engine with esbuild for the browser, runs the whole suite in a blank Chromium page and compares the output — every value, warning and default, serialised as one JSON string — with the Node output. The two strings must be identical. `decimal.js` does all arithmetic in software, so no result depends on the platform's floating point.

Locally: `PLAYWRIGHT_CHANNEL=msedge pnpm --filter @roshd/financial-engine test:e2e`.

## Still to come

The acceptance test of ST-36.01 adds a reference study prepared in COMFAR itself (owed by the owner). It will also settle the interpretations recorded as OQ-39.
