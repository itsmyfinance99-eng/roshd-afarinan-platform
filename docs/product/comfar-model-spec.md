# COMFAR-compatible financial model: engineering spec

- Status: draft for EPIC-33/34/37 (2026-10-02)
- Owner decision: the feasibility methodology is UNIDO with the COMFAR III model (OQ-35); every economic assumption is entered per project by the user (no platform defaults).
- Reference: _COMFAR III Expert Reference Manual_ (UNIDO, 2003). The owner's copy is kept locally in `references/comfar-iii/` (git-ignored; licensed material, never committed). Chapter references below (e.g. "XI.K") point into that manual.
- This spec restates the model in our own terms for implementation in `@roshd/financial-engine` (ADR-0009). Where we deliberately differ from COMFAR, it says so.

## 1. Time and periods

- **Planning horizon** = construction phase + production phase (+ one "scrap" period after production for residual values). Each phase has its own period length (month, quarter, half-year, year). (VII.G)
- **Flows occur on the last day of the period** in which they are defined, unless a loan rule says otherwise. (XI intro)
- **Day-count:** 360-day year, 30-day months. Interest for a sub-interval uses `m/12 + d/360` (whole months plus excess days). (XI.D, XI.M.2)
- **Partial first year:** inflation/escalation entered for the partial year only; fixed costs of a production period shorter than a year scale by `m/12`. (XI.C, XI.J)

## 2. Currencies, inflation, escalation (XI.A–C)

Three currencies: **input** (I, any item may be entered in it), **local** (L, calculation currency), **accounting** (A, reporting currency, with a display unit such as "million rials").

- Without inflation: `P_A = P_I × ER_LI × ER_AL` (constant rates).
- With inflation (user enables per project):
  - relative inflation factor for year j: `PR_j = Π_{i=1..j-1} (1+R_L,i)/(1+R_I,i)`; first year not inflated;
  - current exchange rate `ER_LI,j = PR_j × ER_LI,0` (devaluation follows relative inflation).
  - **Our extension:** the user may instead enter the exchange-rate path directly; the derived rate is one option, not the rule.
- Item price escalation `E` is inflation of the item **relative to** its currency's inflation; current price compounds `(1 + R_j + E_j)` year by year (with a first-year escalator option). Escalation must not double-count inflation; the UI explains this.
- Calculation in L; conversion to A at the **initial** A/L rate, then divided by the display unit.
- **Foreign-currency loans** are computed in their own currency and converted at the current rate; the restatement creates an exchange gain/loss `ADJ_j = B_{j+1} − (B_j + D_j − R_j + CI_j)` (in L), shown in the balance sheet and debt service. (XI.B, XI.M.2)
- **Asset revaluation** (optional, with inflation): `V_j = V_i × FI_j / FI_i`, `FI_j = Π(1+R)`; depreciation on revalued amounts; the uplift is a separate "revaluation adjustment" in net worth. (XI.B)

## 3. Inputs (VII), as model sections

| Section                     | Content (all user-entered)                                                                                                                                                                                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                     | name, sector, type (new / expansion-rehabilitation), special features (inflation, revaluation, cost-centre analysis, cost allocation, working capital by units or value, economic analysis)                                                                                                                                             |
| Horizon                     | construction start, construction and production lengths, period lengths                                                                                                                                                                                                                                                                 |
| Products                    | products with nominal capacity, production interval, unit price path, local/export split, sales tax and subsidy rates                                                                                                                                                                                                                   |
| Currencies                  | local, accounting (+ display unit), foreign currencies with initial rates; optional reference currency (display only)                                                                                                                                                                                                                   |
| Inflation                   | per currency per year, and per-item escalation                                                                                                                                                                                                                                                                                          |
| Discounting                 | discount rate(s), reference date (start of first period or end of first year), MIRR reinvestment and borrowing rates                                                                                                                                                                                                                    |
| Fixed investment            | items by group (land, site preparation, buildings, plant and machinery, auxiliary equipment, incorporated fixed assets, …), currency, schedule, depreciation method/life/salvage, sale of assets                                                                                                                                        |
| Pre-production expenditures | items, schedule, amortisation                                                                                                                                                                                                                                                                                                           |
| Production costs            | per cost item: category (raw materials, factory supplies, utilities, energy, spare parts, labour, labour overheads, factory / administrative / marketing overheads, direct marketing, leasing, other), fixed/variable split, input mode (at nominal capacity or per unit of output), annual adjustments (quantity × price), cost centre |
| Sales programme             | sales quantity per product per period                                                                                                                                                                                                                                                                                                   |
| Working capital             | days of coverage per item (materials by category, WIP, finished products, receivables, cash-in-hand, payables), share of cash-in-hand in short-term deposits and its rate, initial stocks in construction                                                                                                                               |
| Sources of finance          | equity classes (ordinary, preference, joint-venture partners, subsidies/grants), long-term loans (annuity, constant principal, profile; currency; rate path; disbursements; first repayment date; repayment period; grace; capitalised interest; fees), short-term loans                                                                |
| Profit distribution         | retained-profit %, preferred dividend rate + absolute amounts, ordinary dividend %, repatriated share per equity class                                                                                                                                                                                                                  |
| Tax and allowances          | graduated brackets (lower/upper/rate), tax holiday years, loss carry-forward years, investment and depreciation allowances                                                                                                                                                                                                              |
| Expansion/rehabilitation    | starting balances: current assets and liabilities, fixed assets, long-term finance, equity per class                                                                                                                                                                                                                                    |

**No defaults** (deviation from COMFAR, whose DEFAULTS window pre-fills values): a required field left empty blocks calculation with a field-level message. Personal assumption templates may copy values from another project of the same user.

### 3.1 COMFAR defaults and how we handle them

COMFAR pre-fills some values (V.C, VII.B and individual windows). Our rule: economic values are never pre-filled. On 2026-10-02 the owner decided that six COMFAR **conventions** keep their COMFAR default but stay editable (marked below). Every calculation run lists the defaults it used, labelled «پیش‌فرض COMFAR», and the report shows them.

| COMFAR default                                                                                                 | COMFAR value                                                                                    | Our handling                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inflation rate of every currency                                                                               | 0 %                                                                                             | Required. "No inflation" is an explicit per-project choice.                                                                                                                                                                                                                                   |
| Price escalation of every item                                                                                 | 0 %                                                                                             | Required per item or an explicit "no escalation" choice for the project.                                                                                                                                                                                                                      |
| MIRR reinvestment and borrowing rates                                                                          | the project IRR when not entered                                                                | **Owner decision: COMFAR default, editable.** Both rates default to the project IRR of the same basis; the user may enter other rates. The result states which rates were used.                                                                                                               |
| Discount reference date                                                                                        | end of first year                                                                               | **Owner decision: COMFAR default, editable.** End of first year; the user may switch to the start of the first period.                                                                                                                                                                        |
| First loan repayment date                                                                                      | one repayment period after the last disbursement or the start of production, whichever is later | **Owner decision: COMFAR default, editable per loan.** Computed by the COMFAR rule and kept in step with disbursements and the production start until the user overrides it.                                                                                                                  |
| Residual value / sale of assets                                                                                | year after production ends (or after depreciation ends)                                         | **Owner decision: COMFAR default, editable.** Year after production ends; overridable for the project and per asset.                                                                                                                                                                          |
| Break-even period                                                                                              | reference year                                                                                  | **Owner decision: COMFAR default, editable.** The reference year; the user may choose any production year.                                                                                                                                                                                    |
| Depreciation type, loan repayment type, capitalised interest share, cost allocation key, minimum days coverage | user-settable defaults                                                                          | Required per item; a visible "apply to all items" action, no hidden pre-fill.                                                                                                                                                                                                                 |
| Input mode (quantity or price = 1), local currency name, item currency and local/foreign origin, number format | user-settable defaults                                                                          | Allowed as personal UI preferences (they do not change results).                                                                                                                                                                                                                              |
| Cash deficit                                                                                                   | automatic equity / interest-free overdraft                                                      | **Owner decision: COMFAR default, editable.** Automatic equity in construction and an interest-free overdraft in production, each on its own labelled line, plus a warning that the plan is under-financed. The user may switch automatic coverage off (deficit then shown as negative cash). |
| Non-calculable ratio                                                                                           | printed as 0                                                                                    | Shown as "not calculable" with the reason (§5).                                                                                                                                                                                                                                               |
| Data structure (cost items, one product)                                                                       | standard structure by project type and study level                                              | Offered as an empty starting structure (names only, no values).                                                                                                                                                                                                                               |

## 4. Calculation rules

### 4.1 Discounting, NPV, IRR, MIRR (XI.D–E)

- Factor for `m` months from the reference date: `f = (1 + d)^(m/12)`; discounted amount `A / f`.
- `NPV = Σ A_j / f_j + SV / f_n`. When the reference date is the end of the first year, first-year amounts are not discounted (exponents shift by one).
- IRR: rate(s) where NPV = 0. The number of roots can equal the number of sign changes; the engine reports **all roots found or none**, never picks one silently (warning in Persian).
- MIRR rates default to the IRR of the same basis when the user enters none (COMFAR default, editable); the result names the rates used.
- MIRR: surpluses compounded at the reinvestment rate to the year after production ends (`P`), deficits discounted at the borrowing rate to the reference date (`N`), `MIRR = (P/N)^(1/n) − 1`; unique.

### 4.2 Cash-flow bases (XI.F)

- **Total capital invested:** `−(FA_SB + CA_SB − CL_SB) + Σ NCF_j + RV_{n+1}`; `NCF` is the financial-planning cash flow with all financing transactions removed (equity, disbursements, repayments, interest, fees, dividends). Residual value net of fixed assets, working capital and outstanding debt.
- **Total equity:** `−E_SB + Σ NCR_j + RV_{n+1}`; `NCR` removes equity contributions and adds back dividends.
- **Each shareholder class (joint venture):** `−E_SB,i + Σ(−ED + ER + PD + OD) + NW_i`.
- Starting-balance terms apply only to expansion/rehabilitation projects.

### 4.3 Cost allocation (XI.G)

Indirect costs are allocated to products by a key: direct cost, direct factory cost, direct material, direct labour, sales, equal shares, or user percentages (constant). With cost-centre analysis, a centre's indirect costs go only to its products.

### 4.4 Depreciation (XI.H)

Methods: linear to zero, linear to scrap, accelerated (declining balance, switching to linear-to-scrap when that gives more), sum-of-years-digits. Life in years + months; first year may be partial (`m1` months); salvage = rate × initial book value; the remaining book value at the end is written off in the last year. Sale of an asset: proceeds above book value = extraordinary income, below = extraordinary loss; book value at the end of production returns as capital in the scrap year. (XI.I)

### 4.5 Production costs (XI.J)

- At nominal capacity `PC`: standard cost `SC_j = Q × C_j`; fixed part `f × SC_j`; variable part `v × SC_j × S_j(P_j) / PC`; plus adjustments `A_j = Q_aj × C_aj` split by their own fixed/variable shares.
- Per unit of output: variable `Q × C_j × S_j(P_j)`; fixed is an absolute amount; adjustments as above.
- Fixed costs of short periods scale by `m/12`. Fixed costs are charged within the product's production interval even in no-sales periods (unless adjusted).

### 4.6 Sales and production programme (XI.L)

- Coefficient of turnover `c = 30 × m / days_coverage`.
- Finished-goods stock: required `RS_j = S_j / c`; brought forward `B_j = C_{j-1}` (starting balance first); `X = B − S`; carried `C = max(X, RS)`; production `P = S − B + C`. End stock is sold in period n+1.
- Sales ending before production ends, and user-defined production intervals, follow the special cases in XI.L (production reduced before the last sales year; sales outside the interval only from stock).

### 4.7 Net working capital (XI.K)

| Item                                                                        | Basis                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Materials (raw materials, factory supplies, utilities, energy, spare parts) | cost of products produced, materials part; units or value        |
| Work in progress                                                            | cost of products produced, factory cost                          |
| Finished products                                                           | cost of products sold, operating cost (from the programme above) |
| Accounts receivable                                                         | cost of products sold, operating + marketing                     |
| Cash-in-hand                                                                | cost of products produced, operating cost − materials            |
| Accounts payable                                                            | cost of products produced, materials … marketing                 |

- Requirement per item: `RV_j = B_j / c` (value) or `RS_j = S_j(P_j) × Q_j / c` (units, priced at a weighted unit value).
- Initial stocks and starting balances are consumed first: `X_j = WC_{j-1} − consumption_j`; `WC_j = max(X_j, RV_j)`.
- Increase in current assets = cash outflow; increase in current liabilities = inflow (short-term finance). Liquidated in the scrap period.
- Interest on short-term deposits: `IOS_j = CIH_j × s × r × m / 12`. (XI.O)

### 4.8 Finance (XI.M)

- Equity: accumulated by class; preferred dividends use accumulated equity.
- Loans have a disbursement phase then a repayment phase:
  - annuity: payment `A = DB × IR(1+IR)^RP / ((1+IR)^RP − 1)`, `IR = I × LP/12`; interest `DB_{i-1} × IR`; principal `A − interest`; if `I = 0` use constant principal;
  - constant principal: `R = DB / RP`, interest on the opening balance of each period;
  - profile: user-entered disbursements/repayments at any time; interest by sub-intervals.
  - Disbursement phase ends one repayment period before the first repayment (annuity) or the day before it (constant principal); interest dates run back from the first repayment date; interest may be capitalised (adds to the balance and to pre-production expenditure, excluded from the total-capital investment base).
  - Fees: agency (per disbursement), guarantee (p.a. on drawn amount, with interest), commitment (p.a. on undrawn balance, with interest), other (on the total loan, at first disbursement).
- Short-term loans behave like profile loans.

### 4.9 Cash deficit (XI.N)

Default as in COMFAR (owner decision, 2026-10-02): automatic local equity covers a deficit in a construction period (including interest payable) and an interest-free automatic overdraft covers a cumulative deficit in a production period, repaid from the earliest surpluses. Unlike COMFAR, nothing is hidden: the automatic lines are labelled in every schedule and the result warns that the plan is under-financed in the affected periods. The user may switch automatic coverage off; the deficit then shows as negative cash.

### 4.10 Income tax (XI.P) and allowances (XI.R)

- Graduated brackets: each slice taxed at its own rate (worked example in the manual becomes a unit test).
- Tax holiday: no tax for the first N production years.
- Losses carried forward up to N years, used in the earliest possible year (worked example becomes a unit test).
- Investment allowance reduces taxable profit only; depreciation allowance reduces taxable profit and the book value of fixed assets.

### 4.11 Dividends (XI.Q)

- Retained profit = `rr %` of positive net profit; no dividends on a loss.
- Preferred dividends = accumulated equity × rate + absolute amount; if profit available is short, joint-venture partners are served first (three cases with reduction factors).
- Ordinary dividends share the remainder by percentage; a repatriated share per equity class goes to the foreign cash flow.

## 5. Outputs (X.C), one schedule each

1. **Summary sheet** – key figures from the schedules below.
2. **Investment costs** – fixed investment, pre-production expenditures (net of capitalised interest), net working capital requirements by item, total investment; by period and currency (foreign/local).
3. **Production costs** – total costs of products (direct/indirect, fixed/variable, by category), cost allocation by cost centre and product.
4. **Production and sales programme** – quantities, stock, gross sales revenue, sales tax, subsidy, net revenue; local/export.
5. **Sources of finance** – financial flow (equity classes, loans, short-term finance), total debt and debt service, per loan.
6. **Business results**:
   - Cash flow for financial planning (inflows, outflows, surplus/deficit, cumulative cash balance; total, foreign, local);
   - Discounted cash flow, total capital invested (net cash flow, cumulative, NPV, IRR, MIRR, normal and dynamic payback);
   - Discounted cash flow, total equity (and per shareholder class);
   - Net income statement (sales; variable costs by material/personnel/marketing/other; variable margin; fixed costs incl. depreciation; operational margin; interest on deposits; financial costs; gross profit from operations; extraordinary items; allowances; deductible loss; taxable profit; tax; net profit; dividends; retained profit) and ratios (net profit to equity, to net worth, margins);
   - Projected balance sheet (current assets by item, fixed assets net of depreciation, accumulated losses; liabilities, debt, equity, reserves, revaluation and exchange adjustments) — must balance (test).
7. **Evaluation and ratios** – financial ratios (long-term debt to net worth, current ratio, cash flow to debt, debtors to creditors, debt-service coverage) and efficiency ratios; break-even analysis.

### 5.1 Indicator definitions for ST-33.04 (manual X.C.6, read 2026-10-02, not implemented yet)

- **Normal payback period:** duration until, and date of, the first period in which the cumulative net cash flow becomes positive.
- **Dynamic payback period:** the same on the cumulative net present value (discounted at the project discount rate).
- **NPV ratio (NPVR):** `NPV / PVI`, where `PVI` is the present value of total investment per period `I_j = FI_j + PPN_j + IWC_j` (fixed investment + pre-production expenditures + increment of net working capital), over the project periods plus the salvage period.
- **Break-even (per production period, total and per product when cost allocation is active):**
  - variable margin = sales revenue − variable costs; variable margin ratio = margin / revenue;
  - including costs of finance: break-even sales value = (fixed costs excluding interest + interest) / variable margin ratio;
  - excluding costs of finance: break-even sales value = fixed costs excluding interest / variable margin ratio;
  - break-even ratio (% of capacity utilisation) = break-even sales value / sales revenue × 100;
  - fixed-cost coverage ratio = variable margin / (fixed costs [+ financial costs]).
- **Debt-service coverage:** `CF_j / DS_j`, where `CF_j` = surplus of the financial-planning cash flow + repayment + interest + other financial costs, and `DS_j` = repayment + interest + other financial costs (long-term loans).

A ratio that cannot be computed is shown as "not calculable" with a reason, **not** as zero (deviation from COMFAR, which prints zero).

## 6. Economic analysis (VIII, XII, X.D) — EPIC-37

All values in a user-chosen numeraire; every parameter user-entered.

- **Value added:** `GDVA = (O + OI) − M`; `NDVA = GDVA − I`; `NNVA = NDVA − R` (repatriated wages, profits, interest, others); distribution to wages, profits/interest, government (taxes net of subsidies) and others; present values.
- **Net foreign-exchange effect:** foreign inflows minus outflows over the horizon, and its present value.
- **Employment:** direct employment by group from the labour inputs; indirect employment user-entered; investment per job.
- **Cost-benefit:** items classified and converted from financial to economic value (remove taxes/duties/subsidies, adjust market prices, foreign-exchange adjustment via shadow exchange rate, indirect effects), conversion to the numeraire, economic NPV and IRR at the economic discount rate.

Details of chapter XII are read again when ST-37.01–37.04 start.

## 7. Sensitivity and incremental analysis (XIII, XIV)

- **Global change of input data:** scale groups of inputs (e.g. all sales prices −10 %) and recompute.
- **Goal seek:** the value of one input that yields a target IRR or NPV.
- **Charts:** indicator against variations of chosen inputs (our tornado and spider charts).
- **Incremental analysis:** difference between "with project" and "without project" cases of an existing enterprise, indicators on the difference.

## 8. Test plan for the engine

- Every formula above has unit tests; the manual's worked examples (graduated tax, loss carry-forward, working-capital tables) become fixtures.
- Property tests: NPV at each IRR ≈ 0; annuity and constant-principal schedules repay exactly the principal; the balance sheet balances every period; cumulative cash in the financial-planning cash flow equals the balance-sheet cash.
- Acceptance (ST-36.01): a reference study prepared in COMFAR, re-entered in our editor, must reproduce its schedules within a documented tolerance; differences explained (e.g. our explicit cash-deficit handling).
