import {
  incrementalAnalysis,
  projectModel,
  type ProjectInput,
  type StartingBalances,
} from '@roshd/financial-engine';
import { describe, expect, it } from 'vitest';
import type { ReportDocument, TableBlock } from './document';
import { frameOfHorizon } from './frame';
import { runReport } from './report';
import {
  discountedCashFlowTable,
  incrementalCashFlowTable,
  incrementalFlowTable,
  tableColumns,
} from './tables';
import { sampleInput } from './testing/sample-input';

/** The sample project as the expansion of an existing enterprise. Test data only. */
const balances: StartingBalances = {
  fixedAssets: [{ item: 'building', value: '80000' }],
  materials: [{ cost: 'yarn', value: '5000' }],
  workInProgress: [{ product: 'fabric', value: '1000' }],
  finishedProducts: [{ product: 'fabric', quantity: '10', price: '50' }],
  receivables: { value: '4000', collectionDays: 60 },
  payables: { value: '3000', paymentDays: 800 },
  cashInHand: '500',
  shortTermDeposits: '200',
  cashSurplus: '1500',
  loans: [],
  equity: [{ equity: 'founders', value: '60000' }],
};
const expansion: ProjectInput = { ...sampleInput, startingBalances: balances };
const stored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const outcome = projectModel(expansion);

const report = (): ReportDocument =>
  runReport({
    modelTitle: 'توسعه کارخانه نساجی',
    run: {
      number: 1,
      modelVersion: 1,
      engineVersion: outcome.modelVersion,
      inputHash: 'b'.repeat(64),
      createdAt: '2026-10-04T08:00:00Z',
      approvedAt: null,
    },
    input: stored(expansion),
    results: stored(outcome.value),
    warnings: stored(outcome.warnings),
    defaultsUsed: stored(outcome.defaultsUsed),
    unit: '1',
  });
const tablesOf = (document: ReportDocument, id: string): TableBlock[] =>
  (document.parts.find((part) => part.id === id)?.blocks ?? []).filter(
    (block): block is TableBlock => block.kind === 'table',
  );
const rowOf = (table: TableBlock | undefined, label: string) =>
  table?.sections.flatMap((section) => section.rows).find((row) => row.label === label);

describe('report of an expansion project', () => {
  const document = report();

  it('reads every part and keeps one value per column', () => {
    for (const part of document.parts) {
      expect(
        part.blocks.some((block) => block.kind === 'text'),
        part.id,
      ).toBe(false);
      for (const block of part.blocks) {
        if (block.kind === 'table') {
          for (const row of block.sections.flatMap((section) => section.rows)) {
            expect(row.values, `${block.title}: ${row.label}`).toHaveLength(block.columns.length);
          }
        } else if (block.kind === 'grid') {
          for (const row of block.rows) expect(row).toHaveLength(block.head.length);
        }
      }
    }
  });

  it('starts the balance sheet with the day before the project', () => {
    const [balance] = tablesOf(document, 'balance');
    expect(balance?.columns[0]).toEqual({ label: 'پیش از طرح', group: 'مانده آغازین' });
    expect(balance?.columns).toHaveLength(11);
    const start = outcome.value.statements.startingBalance;
    expect(rowOf(balance, 'جمع دارایی‌ها')?.values[0]?.number).toBe(start?.assets.total);
    expect(rowOf(balance, 'جمع بدهی‌ها و حقوق صاحبان سهام')?.values[0]?.number).toBe(
      start?.liabilities.total,
    );
    // 80 000 of buildings, 11 200 of current assets and 1 500 of cash against 3 000 and 60 000.
    expect(start?.assets.total).toBe('92700');
    expect(rowOf(balance, 'سود انباشته')?.values[0]?.number).toBe('29700');
    expect(rowOf(balance, 'سود و کارمزد دوره ساخت')?.values[0]?.number).toBe('0');
  });

  it('starts the cash flow with the cash surplus of the enterprise', () => {
    const [cashFlow] = tablesOf(document, 'cash-flow');
    expect(cashFlow?.columns[0]?.label).toBe('پیش از طرح');
    expect(rowOf(cashFlow, 'مازاد (کسری) تجمعی')?.values[0]?.number).toBe('1500');
    expect(rowOf(cashFlow, 'مانده نقد پایان دوره')?.values[0]?.number).toBe('1500');
    expect(rowOf(cashFlow, 'جمع ورودی‌ها')?.values[0]).toEqual({ text: '—' });
    // The first period continues from it.
    const { cashFlow: flow } = outcome.value.statements;
    expect(Number(flow.cumulativeSurplus[0])).toBe(1500 + Number(flow.surplus[0]));
  });

  it('keeps the balance sheet balanced through construction, start-up and production', () => {
    // The sample has two construction years, start-up quarters, a foreign loan with capitalised
    // interest, the sale of an asset and allowances.
    const { assets, liabilities } = outcome.value.statements.balanceSheet;
    expect(assets.total).toHaveLength(10);
    assets.total.forEach((total, j) => {
      const gap = Math.abs(Number(total) - Number(liabilities.total[j]));
      expect(gap, `period ${j + 1}`).toBeLessThan(1e-9 * Math.abs(Number(total)));
    });
  });

  it('charges the discounted cash flows with the starting balance in a column of its own', () => {
    const [totalCapital, equity] = tablesOf(document, 'discounted');
    // The day before the project, ten periods and the year after production.
    expect(totalCapital?.columns).toHaveLength(12);
    const charge = rowOf(totalCapital, 'مانده آغازین (دارایی‌های ثابت و جاری منهای بدهی‌های جاری)');
    expect(charge?.values[0]?.number).toBe('89700');
    expect(charge?.values[1]).toEqual({ text: '—' });
    expect(rowOf(totalCapital, 'جریان نقد خالص')?.values[0]?.number).toBe('-89700');
    expect(rowOf(totalCapital, 'ورودی نقد')?.values[0]).toEqual({ text: '—' });
    expect(rowOf(equity, 'مانده آغازین (آورده موجود)')?.values[0]?.number).toBe('60000');
    // The cumulative line of the engine continues from the charge.
    const first = outcome.value.statements.totalCapital;
    expect(rowOf(totalCapital, 'جریان نقد خالص تجمعی')?.values[1]?.number).toBe(
      String(-89700 + Number(first.net[0])),
    );
  });

  it('lists the starting balances with the inputs', () => {
    const inputs = document.parts.find((part) => part.id === 'inputs')?.blocks ?? [];
    const titles = inputs.flatMap((block) => ('title' in block ? [block.title] : []));
    expect(titles).toEqual(
      expect.arrayContaining([
        'ترازنامه آغازین شرکت موجود (به پول محلی، روز پیش از شروع طرح)',
        'مانده آغازین دارایی‌های ثابت',
        'مانده آغازین موجودی‌ها',
        'مانده آغازین تسهیلات و آورده',
      ]),
    );
    expect(JSON.stringify(inputs)).toContain('توسعه یا بازسازی شرکت موجود');
    const working = tablesOf(document, 'investment')[1];
    expect(rowOf(working, 'از آن: پرداختنی‌های آغازین پرداخت‌نشده')?.values[0]?.number).toBe(
      '3000',
    );
  });

  it('shows no starting column for a new project or a balance of zero', () => {
    const fresh = projectModel(sampleInput).value.statements;
    expect(discountedCashFlowTable(fresh, 'totalCapital').openingColumn).toBeUndefined();
    const zero = { ...fresh, equity: { ...fresh.equity, startingBalance: '0' } };
    expect(discountedCashFlowTable(zero, 'equity').openingColumn).toBeUndefined();
  });
});

describe('tables of an incremental analysis', () => {
  // Without the project the enterprise sells a tenth less of its fabric at home.
  const without: ProjectInput = {
    ...expansion,
    operations: {
      ...expansion.operations,
      products: expansion.operations.products.map((product) =>
        product.key !== 'fabric'
          ? product
          : {
              ...product,
              sales: product.sales.map((line) =>
                line.capacityShares === undefined
                  ? { ...line, quantities: line.quantities?.map((q) => String(Number(q) * 0.9)) }
                  : {
                      ...line,
                      capacityShares: line.capacityShares.map((s) => String(Number(s) * 0.9)),
                    },
              ),
            },
      ),
    },
  };
  const base = projectModel(without).value;
  const analysis = incrementalAnalysis({
    withProject: outcome.value,
    withoutProject: base,
    discounting: expansion.statements.discounting,
  }).value;
  const frame = frameOfHorizon(sampleInput.horizon);

  it('shows both cases and their difference, one value per column', () => {
    const table = incrementalFlowTable(
      analysis,
      outcome.value.statements,
      base.statements,
      'totalCapital',
    );
    // The starting balances are the same in both cases: no column for them.
    expect(table.openingColumn).toBeUndefined();
    expect(table.salvageColumn).toBe(true);
    const columns = frame === null ? [] : tableColumns(frame, table.salvageColumn);
    expect(columns).toHaveLength(11);
    const rows = table.sections.flatMap((section) => section.rows);
    for (const row of rows) expect(row.values, row.label).toHaveLength(columns.length);
    expect(rows.map((row) => row.label)).toEqual([
      'با طرح',
      'بدون طرح',
      'جریان نقد خالص افزایشی',
      'جریان نقد خالص افزایشی تجمعی',
      'ارزش فعلی جریان نقد افزایشی',
      'ارزش فعلی تجمعی',
    ]);
    expect(rows[0]?.values).toEqual(outcome.value.statements.totalCapital.net);
    expect(rows[2]?.values).toEqual(analysis.totalCapital.net);
  });

  it('gives the cash flow of the difference its own title', () => {
    const table = incrementalCashFlowTable(analysis);
    expect(table.id).toBe('incremental-cash-flow');
    expect(table.title).toContain('با طرح منهای بدون طرح');
    expect(table.sections[0]?.rows.at(-1)?.values).toEqual(analysis.cashFlow.inflows.total);
  });
});
