# Engine acceptance: UNIDO sample case (ST-36.01)

- Date: 2026-10-03
- Status: engine side done; **the review by the company's financial expert is still open** (acceptance criterion of ST-36.01).
- Reference study: annex I of the UNIDO _Manual for the Preparation of Industrial Feasibility Studies_ (W. Behrens and P. M. Hawranek, newly revised and expanded edition, Vienna 1991). Its schedules X-1 to X-11 were produced with COMFAR. The owner supplied the book; it is kept locally in `references/` and not committed. Only figures are used.
- Test: `packages/financial-engine/src/acceptance/unido-case.test.ts`, input in `unido-case.ts` (`pnpm --filter @roshd/financial-engine test`).

## The case

A garment factory. Construction 1991–1992, production 1993–2007 (55 %, 75 %, 90 %, then full capacity), residual values in 2008. Sales 12 500 a year at full capacity. Fixed investment 7 710 plus a replacement of 1 000 in 1998, pre-production expenditures 308 plus interest of construction. Equity 3 500, a supplier credit of 2 600 at 8 % and a local loan of 3 000 at 10 % (ten half-yearly instalments each), a bank overdraft of 400 at 12 % in the start-up years. Tax 50 % after four exempt years, losses carried forward for three years, a dividend of 630 a year from 1995. Discount rate 12 %. Amounts in thousands of national currency units.

## Result

| Indicator                          | Book   | Engine  | Difference |
| ---------------------------------- | ------ | ------- | ---------- |
| NPV of the total capital at 12 %   | 3 856  | 3 864.0 | +0.21 %    |
| IRR of the total capital           | 18.8 % | 18.80 % | none       |
| NPV of the equity at 12 %          | 4 164  | 4 172.4 | +0.20 %    |
| IRR of the equity (schedule X-9/2) | 23.4 % | 23.47 % | +0.07 pt   |
| Residual value in 2008             | 3 123  | 3 112.5 | −10.5      |

Equal to the printed figures in every year (to the rounding of the book, ±1):

- fixed investment, pre-production expenditures and their foreign parts (X-1, X-2, X-6);
- interest of the construction years as pre-production cost (29 and 273), debt balances, repayments and costs of finance of both loans and the overdraft (X-7);
- sales revenue, variable costs, fixed costs, depreciation (780, then 840, 490 and 110), gross profit, the tax holiday, income tax, net profit and dividends (X-3, X-10);
- book value of fixed assets (X-11);
- net cash flow of the total capital from 1998 on, when working capital is constant (X-9/1).

## Differences and their cause

1. **Net working capital (at most 19 a year in the cash flows, 11 in the residual value).** The book of 1991 computes every working-capital item on the costs of the products **sold** and cash-in-hand on local operating costs less raw materials and factory supplies (2 950 / 24 = 123 in 1993). COMFAR III, which the engine follows (reference manual XI.K, table 18), uses the costs of the products **produced** for materials, work in progress, cash-in-hand and payables, and counts spare parts among the materials, so cash-in-hand is 2 700 / 24 = 112.5 before the effect of the stock of finished products. The test shows that this is the only cause: with production equal to sales, raw materials, factory supplies, spare parts, work in progress, receivables and payables are the printed figures; finished products are the printed figures in the main run. These few units are the whole difference in NPV (0.2 %) and in the residual value.
2. **A remainder of 21 in "raw materials in stock" in 1993 and 1994.** The book carries part of the initial stock of 400 for two years; the engine consumes the initial stock in the first production year, as COMFAR III's algorithm does (stock left after the year's consumption, or the requirement if that is higher).
3. **IRR on equity.** The schedule prints 23.4 %, the text of the annex 22.7 %; the engine gives 23.47 %, which follows from difference 1.
4. **Presentation of the balance sheet.** The book shows dividends as payable inside the cash surplus and the loss of 1993 as an asset line; the engine shows cash after dividends and accumulated losses on their own line. Totals therefore differ although the underlying figures agree.

## How the inputs were read

- **Disbursements in the middle of the year.** The book charges interest on the mean debt of a disbursement year (note to schedule X-7/6). In the engine every disbursement is on day 180 of its year (30/360 calendar), which gives the same interest: 720 × 8 % × ½ = 28.8 in 1991.
- **Depreciation.** 10 % a year, straight-line; 1 000 of the local civil works at 5 %; machinery stops at its salvage value of 10 % (nine years of 350), which is the engine's "linear to zero" with a salvage rate; land is not depreciated. The replacement of 1998: the book depreciates the local part only (60 a year from 1999) and returns the foreign part of 400 in full; the input follows the book.
- **Dividends.** COMFAR III distributes profit by percentages, the book pays a fixed 630. The test derives the retained share of each year from the net profit (which does not depend on it).
- **Overdraft.** Entered as a loan with its own disbursement and repayments; the engine shows it with the long-term debt (6 000 = 5 600 + 400 in 1993).
- **One product.** One unit is a year's output at full capacity; the 30 % export share and the 6 % export charge are inside the marketing costs given by the book.

## What this settles of OQ-39, and what it does not

Confirmed by this case: discounting with the first year as reference date; interest and fees paid during construction as pre-production expenditures that are depreciated; straight-line depreciation ending at the salvage value; residual values in the year after production; tax holiday and tax; the cash flow and the two discounted cash flows.

Not exercised by this case (still open in OQ-39): inflation and escalation, foreign currencies and exchange adjustments, declining-balance and sum-of-years-digits depreciation with a partial first year, start-up periods shorter than a year, capitalised interest, cost allocation among several products, allowances, sale of assets, preferred dividends. A second reference study that uses these features — ideally one run in COMFAR III itself — would cover them.

## Decisions

- **Working capital (owner, 2026-10-03):** COMFAR III's rule is the criterion. Differences 1 and 2 are accepted as they are; the engine does not offer the convention of the 1991 edition.

## Open for the expert

- Confirm the reading of the replacement of 1998 and of the fixed dividend.
- A second reference study for the features this case does not use (see above).
