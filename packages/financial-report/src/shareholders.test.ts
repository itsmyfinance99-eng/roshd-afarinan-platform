import { projectModel, type ProjectInput } from '@roshd/financial-engine';
import { describe, expect, it } from 'vitest';
import type { PairsBlock, ReportDocument, TableBlock } from './document';
import { runReport } from './report';
import { cashFlowTable, shareholderFlowTables } from './tables';
import { sampleInput } from './testing/sample-input';

/** The sample project with a distribution of the net worth and a refund of equity. Test data. */
const SHARES: Record<string, string> = { founders: '0.6', fund: '0.1', partner: '0.3' };
const venture: ProjectInput = {
  ...sampleInput,
  financing: {
    ...sampleInput.financing,
    equity: sampleInput.financing.equity.map((equity) =>
      equity.key === 'fund'
        ? { ...equity, refunds: equity.amounts.map((_, j) => (j === 9 ? '40000' : '0')) }
        : equity,
    ),
  },
  statements: {
    ...sampleInput.statements,
    profitDistribution: {
      ...sampleInput.statements.profitDistribution,
      shareholders: sampleInput.statements.profitDistribution.shareholders.map((holder) => ({
        ...holder,
        netWorthShare: SHARES[holder.equity] ?? '0',
      })),
    },
  },
};
const stored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const outcome = projectModel(venture);
const report = (results: unknown = stored(outcome.value)): ReportDocument =>
  runReport({
    modelTitle: 'مشارکت نساجی',
    run: {
      number: 1,
      modelVersion: 1,
      engineVersion: outcome.modelVersion,
      inputHash: 'c'.repeat(64),
      createdAt: '2026-10-04T08:00:00Z',
      approvedAt: null,
    },
    input: stored(venture),
    results,
    warnings: stored(outcome.warnings),
    defaultsUsed: stored(outcome.defaultsUsed),
    unit: '1',
  });
const blocksOf = (document: ReportDocument, id: string) =>
  document.parts.find((part) => part.id === id)?.blocks ?? [];
const tablesOf = (document: ReportDocument, id: string): TableBlock[] =>
  blocksOf(document, id).filter((block): block is TableBlock => block.kind === 'table');
const rowOf = (table: TableBlock | undefined, label: string) =>
  table?.sections.flatMap((section) => section.rows).find((row) => row.label === label);

describe('report of a run with shareholder cash flows', () => {
  const document = report();
  const flows = outcome.value.statements.shareholders ?? [];

  it('adds a table and the indicators of every shareholder', () => {
    expect(flows.map((flow) => flow.equity)).toEqual(['founders', 'fund', 'partner']);
    const discounted = tablesOf(document, 'discounted');
    expect(discounted).toHaveLength(5);
    const fund = discounted[3];
    expect(fund?.title).toContain('fund');
    for (const table of discounted) {
      for (const row of table.sections.flatMap((section) => section.rows)) {
        expect(row.values, `${table.title}: ${row.label}`).toHaveLength(table.columns.length);
      }
    }
    // The refund of 40 000 in the last period, and a tenth of the net worth after production.
    expect(rowOf(fund, 'بازپرداخت آورده')?.values[9]?.number).toBe('40000');
    // Shown in whole units, like every amount of the report.
    const whole = (value: string | undefined) => String(Math.round(Number(value)));
    expect(rowOf(fund, 'سهم از ارزش ویژه پایان طرح')?.values[10]?.number).toBe(
      whole(flows[1]?.residualValue),
    );
    expect(rowOf(fund, 'جریان نقد خالص')?.values.map((value) => value.number)).toEqual(
      flows[1]?.net.map(whole),
    );
    const summary = blocksOf(document, 'summary').filter(
      (block): block is PairsBlock => block.kind === 'pairs',
    );
    const titles = summary.map((block) => block.title ?? '');
    expect(titles.filter((title) => title.startsWith('شاخص‌های سهامدار'))).toHaveLength(3);
  });

  it('shows the refund in the cash flow and in the sources of finance', () => {
    const [cashFlow] = tablesOf(document, 'cash-flow');
    expect(rowOf(cashFlow, 'بازپرداخت آورده')?.values[9]?.number).toBe('40000');
    const [sources] = tablesOf(document, 'financing');
    expect(rowOf(sources, 'بازپرداخت آورده')?.values[9]?.number).toBe('40000');
    const inputs = JSON.stringify(blocksOf(document, 'inputs'));
    expect(inputs).toContain('بازپرداخت آورده در هر دوره');
    expect(inputs).toContain('سهم از ارزش ویژه پایان طرح (درصد)');
  });

  it('still reads a run stored before refunds and shareholder flows existed', () => {
    const old = stored(outcome.value) as unknown as {
      statements: { shareholders?: unknown; cashFlow: { outflows: Record<string, unknown> } };
      financing: { equity: Record<string, unknown> };
    };
    delete old.statements.shareholders;
    delete old.statements.cashFlow.outflows.equityRefunds;
    delete old.financing.equity.refunds;
    const document = report(old);
    for (const part of document.parts) {
      expect(
        part.blocks.some((block) => block.kind === 'text'),
        part.id,
      ).toBe(false);
    }
    expect(tablesOf(document, 'discounted')).toHaveLength(2);
    expect(rowOf(tablesOf(document, 'cash-flow')[0], 'بازپرداخت آورده')).toBeUndefined();
    expect(shareholderFlowTables({})).toEqual([]);
    const table = cashFlowTable(old.statements as never);
    expect(table.sections[1]?.rows.map((row) => row.label)).not.toContain('بازپرداخت آورده');
  });
});
