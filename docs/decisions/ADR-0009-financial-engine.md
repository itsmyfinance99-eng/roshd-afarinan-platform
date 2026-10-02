# ADR-0009: Financial engine and project financial model

- Status: Proposed
- Date: 2026-10-02

## Context

The financial engine (roadmap Phase 4) and the feasibility platform (Phase 3) now come before the LMS (owner's decision, 2026-10-02). Phase 1 left a port, `FinancialCalculator` in `apps/api/src/modules/financial-engine/ports`, with decimal strings and a model version on every result, but no formulas.

The owner set one rule for every assumption: **discount rate, inflation, tax, exchange rates, interest and the like are entered by the user for each project, for the conditions of the day.** The platform ships no economic defaults.

Forces:

- Results feed feasibility reports that banks, funds and investors rely on. They must be exact, reproducible years later, and explainable.
- Experts want to see results change while they edit inputs; the API must still be the authority for anything saved or delivered.
- The owner chose the UNIDO methodology and the COMFAR III model (OQ-35): inputs, output schedules and calculation conventions should match COMFAR so studies are accepted by banks and funds used to it.
- Iranian projects mix currencies (imported machinery in foreign currency, sales in rials), run under high inflation, and often have tax exemption periods and loans with grace periods.

## Decision

1. **A pure workspace package `@roshd/financial-engine`** (`packages/financial-engine`): TypeScript, no Nest, Prisma, React or I/O. The API and the web app both import it. The existing port types move into it; `apps/api` keeps a thin adapter that implements the `FinancialCalculator` port with it.
2. **Arbitrary-precision decimals.** All arithmetic uses `decimal.js` (34 significant digits). Inputs and outputs cross every boundary as decimal strings. Rounding happens only for display (`HALF_EVEN`, explicit scale). Binary floating point is not allowed in the package (lint rule plus tests).
3. **No economic defaults.** Every rate, index, exchange rate, tax rule and loan term is an input. An assumption carries value, unit, period, an optional per-period path, and a free-text source and as-of date. Missing required assumptions block calculation with a field-level message; nothing is filled in silently. Users may save their own assumption sets as templates and copy them into another project; the platform never supplies one.
4. **Layers.**
   - _Core math_: time value (PV, FV, NPV with end or mid-period convention), IRR (bracketed solver with sign-change analysis; reports none or multiple roots instead of guessing), MIRR, payback and discounted payback, profitability index, break-even (units, revenue, multi-product), DSCR and LLCR, WACC, real/nominal conversion.
   - _Schedules_: loans (grace period, annuity or equal principal, capitalised or paid interest during construction, several facilities and currencies), depreciation (straight line, declining balance, per asset class), escalation by index path, currency conversion by exchange-rate path.
   - _Project model_: investment plan, production ramp-up, revenue, variable and fixed costs, working capital, financing, tax with user-entered exemption periods and loss carry-forward, producing income statement, cash-flow statements (project and equity view), a summary balance sheet and the indicators.
   - _Analysis_: scenarios as assumption overrides, one-way sensitivity (tornado), switching values, goal seek for a target IRR or NPV, global change of inputs.
   - _Economic analysis_: value added (gross/net domestic, net national, distribution), net foreign-exchange effect, employment effects, cost-benefit with shadow prices (numeraire, shadow exchange rate and economic discount rate are user inputs).
5. **COMFAR compatibility.** Inputs follow COMFAR's structure (planning horizon with construction and production phases, products, currencies, cost centres, inflation, discounting, fixed investment, pre-production costs, production costs, sales programme, working capital, sources of finance, tax and allowances, expansion/rehabilitation, joint-venture partners) and outputs reproduce its financial schedules (summary sheet, investment costs, production costs, sales programme, sources of finance and debt service, cash flow for financial planning, discounted cash flow on total capital and on equity, net income statement and ratios, projected balance sheet). COMFAR's calculation conventions are available as explicit options: monthly discounting on a 360-day year, reference date at the start of the first period or end of the first year, salvage value in NPV, MIRR with separate reinvestment and borrowing rates, exchange rates derived from relative inflation, graduated tax brackets with tax holiday and loss carry-forward, interest on short-term deposits. **One deliberate difference:** COMFAR silently covers cash deficits with automatic equity or overdraft; this engine always reports the deficit and covers it only if the user asks, on a separate line.
6. **Versioned and reproducible.** The package exports `MODEL_VERSION` (SemVer). The API stores every saved calculation as a run: input snapshot, input hash, model version, results, warnings, user and time. A run is never recalculated in place; a new run is created. Old runs stay readable after the engine changes.
7. **Golden tests.** Deterministic fixtures with hand-checked or spreadsheet-checked reference values, the worked examples of the COMFAR rules (e.g. graduated tax, loss carry-forward), property tests (NPV at the IRR is zero within tolerance; a loan schedule repays exactly the principal), and the same suite runs in Node and in the browser build.
8. **Advisory output.** Results are decision support. Delivered reports use a run approved by an expert (ADR-0010); nothing overwrites expert-approved data automatically.

## Consequences

- One engine everywhere: live preview in the editor and authoritative results in the API cannot drift apart.
- A new dependency, `decimal.js` (small, no transitive dependencies).
- Users must enter every assumption, which is more work but matches how studies are defended. Personal assumption templates soften it.
- Changing a formula is a model-version bump and shows up in every new run.

## Alternatives considered

- **Engine inside the API only.** Simpler, but the editor would need a round trip per keystroke or a second implementation in the browser. Rejected.
- **Spreadsheet export as the engine (formulas in Excel).** Hard to test, version and secure. Excel stays an export format only.
- **Platform-wide default rates maintained by staff.** Explicitly rejected by the owner: conditions change and differ per project.
- **JavaScript `number` with rounding.** Fails on large rial amounts and compounding. Rejected.
