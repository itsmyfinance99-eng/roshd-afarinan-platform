'use client';

import type { ProjectInput, ProjectModel } from '@roshd/financial-engine';
import { Button, ErrorMessage, FieldShell, Notice, Select, toPersianDigits } from '@roshd/ui';
import type { ReportingUnit } from '@roshd/validation';
import { useId, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { Frame } from '@/lib/model-editor/frame';
import { textAt } from '@/lib/model-editor/paths';
import type { IncrementalOutcome } from '@/lib/model-editor/incremental';
import { useApi } from '@/lib/use-api';
import {
  incrementalCashFlowTable,
  incrementalFlowTable,
  tableColumns,
  type StatementTable,
} from '@roshd/financial-report/tables';
import { BASIS_LABELS_FA, type Basis } from '@roshd/financial-report/warnings';
import type { CalculationRunDetail, CalculationRunSummary, FinancialModelSummary } from '../types';
import { IndicatorCard } from './indicator-card';
import { StatementTableView } from './statement-table';

const BASES: Basis[] = ['totalCapital', 'equity'];
/** More than a model may hold of either, so one request lists them all. */
const LIST = 'page=1&pageSize=100';

function isModel(value: unknown): value is ProjectModel {
  const statements = (value as { statements?: unknown } | null)?.statements;
  return statements !== null && typeof statements === 'object';
}

type Result =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'done';
      outcome: Extract<IncrementalOutcome, { ok: true }>;
      base: ProjectModel;
      baseTitle: string;
    };

/**
 * Incremental analysis (ST-34.11; COMFAR XIV): the run on screen is the enterprise with the
 * project; the user chooses a stored run of the enterprise without it, with the same planning
 * horizon. The difference of the two stored results is calculated in the browser and never stored.
 */
export function IncrementalPanel({
  modelId,
  run,
  model,
  input,
  frame,
  unit,
  unitLabel,
}: {
  modelId: string;
  run: CalculationRunDetail;
  model: ProjectModel;
  /** The input of the run as this version reads it: its discount rates are used. */
  input: ProjectInput;
  frame: Frame;
  unit: ReportingUnit;
  unitLabel: string;
}) {
  const modelFieldId = useId();
  const runFieldId = useId();
  const [baseModelId, setBaseModelId] = useState(modelId);
  const [baseRunId, setBaseRunId] = useState('');
  const [result, setResult] = useState<Result>({ status: 'idle' });

  // The caller's own models and, for an expert, the models assigned to them.
  const mine = useApi<FinancialModelSummary[]>(`/financial-models?scope=mine&${LIST}`);
  const assigned = useApi<FinancialModelSummary[]>(`/financial-models?scope=assigned&${LIST}`);
  const runs = useApi<CalculationRunSummary[]>(
    `/financial-models/${encodeURIComponent(baseModelId)}/runs?${LIST}`,
  );

  const models = new Map<string, string>();
  for (const { state } of [mine, assigned]) {
    if (state.status === 'success') for (const m of state.data) models.set(m.id, m.title);
  }
  // The model of this run is always offered, also to staff who neither own it nor are assigned.
  const others = [...models].filter(([id]) => id !== modelId);
  const candidates =
    runs.state.status === 'success' ? runs.state.data.filter((r) => r.id !== run.id) : [];

  const choose = (change: () => void) => {
    change();
    // A result belongs to the runs it was calculated from.
    setResult({ status: 'idle' });
  };

  const calculate = async () => {
    setResult({ status: 'loading' });
    const response = await apiFetch<CalculationRunDetail>(
      `/financial-models/${encodeURIComponent(baseModelId)}/runs/${encodeURIComponent(baseRunId)}`,
    );
    if (!response.ok) {
      setResult({ status: 'error', message: response.message });
      return;
    }
    const base = response.data.results;
    if (!isModel(base)) {
      setResult({
        status: 'error',
        message:
          'نتایج اجرای «بدون طرح» با این نسخه از برنامه خوانده نمی‌شود. از ورودی‌های آن مدل اجرای تازه‌ای ثبت کنید.',
      });
      return;
    }
    // Amounts of two currencies cannot be subtracted.
    const currency = textAt(response.data.input, ['localCurrency']);
    if (currency !== input.localCurrency) {
      setResult({
        status: 'error',
        message: `پول محلی دو اجرا یکی نیست (این اجرا ${input.localCurrency} و اجرای «بدون طرح» ${
          currency || 'نامشخص'
        })؛ تحلیل افزایشی فقط برای دو اجرا با یک پول محلی معنا دارد.`,
      });
      return;
    }
    // The engine is loaded only when an analysis is asked for.
    const { incremental } = await import('@/lib/model-editor/incremental');
    const outcome = incremental(model, base, input.statements.discounting);
    setResult(
      outcome.ok
        ? {
            status: 'done',
            outcome,
            base,
            baseTitle: `${
              baseModelId === modelId ? 'همین مدل' : `مدل «${models.get(baseModelId) ?? ''}»`
            }، اجرای شماره ${toPersianDigits(response.data.number)}`,
          }
        : { status: 'error', message: outcome.message },
    );
  };

  const table = (build: () => StatementTable) => {
    const built = build();
    return (
      <StatementTableView
        table={built}
        columns={tableColumns(frame, built.salvageColumn, built.openingColumn)}
        unit={unit}
        unitLabel={unitLabel}
      />
    );
  };

  return (
    <>
      <h2 className="sr-only">تحلیل افزایشی</h2>
      <div className="flex flex-col gap-2 text-sm leading-7 text-ink-3">
        <p>
          تحلیل افزایشی اثر خود طرح را بر یک شرکت موجود نشان می‌دهد: این اجرا حالت «با طرح» است و
          اجرایی که انتخاب می‌کنید حالت «بدون طرح» (همان شرکت بدون سرمایه‌گذاری تازه). تفاضل
          جریان‌های نقدی دو حالت محاسبه می‌شود و شاخص‌ها روی همان تفاضل به دست می‌آید.
        </p>
        <p>
          افق برنامه‌ریزی دو اجرا باید یکسان باشد. نرخ تنزیل و تاریخ مرجع از ورودی‌های همین اجرا
          گرفته می‌شود. نتیجه ذخیره نمی‌شود.
        </p>
      </div>

      <div className="grid items-end gap-4 md:grid-cols-[1fr_1fr_auto]">
        <FieldShell id={modelFieldId} label="مدل حالت «بدون طرح»">
          <Select
            id={modelFieldId}
            value={baseModelId}
            disabled={result.status === 'loading'}
            onChange={(event) =>
              choose(() => {
                setBaseModelId(event.target.value);
                setBaseRunId('');
                // The runs of the model chosen before are not offered while the new ones load.
                runs.reload();
              })
            }
          >
            <option value={modelId}>همین مدل</option>
            {others.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </Select>
        </FieldShell>
        <FieldShell id={runFieldId} label="اجرای حالت «بدون طرح»">
          <Select
            id={runFieldId}
            value={baseRunId}
            disabled={runs.state.status !== 'success' || result.status === 'loading'}
            onChange={(event) => choose(() => setBaseRunId(event.target.value))}
          >
            <option value="">
              {runs.state.status === 'loading' ? 'در حال بارگذاری…' : 'انتخاب کنید'}
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                اجرای شماره {toPersianDigits(candidate.number)}
                {candidate.approvedAt ? ' (تأییدشده)' : ''}
              </option>
            ))}
          </Select>
        </FieldShell>
        <Button
          size="xl"
          disabled={baseRunId === '' || result.status === 'loading'}
          onClick={() => void calculate()}
        >
          {result.status === 'loading' ? 'در حال محاسبه…' : 'محاسبه تحلیل افزایشی'}
        </Button>
      </div>

      {runs.state.status === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <ErrorMessage>{runs.state.message}</ErrorMessage>
          <Button variant="outline" onClick={() => runs.reload()}>
            تلاش دوباره
          </Button>
        </div>
      ) : null}
      {runs.state.status === 'success' && candidates.length === 0 ? (
        <Notice>
          این مدل اجرای ثبت‌شده دیگری ندارد. برای حالت «بدون طرح»، ورودی‌های شرکت موجود را بدون
          سرمایه‌گذاری تازه در یک مدل (یا در همین مدل، پیش از افزودن طرح) وارد و اجرای آن را ثبت
          کنید.
        </Notice>
      ) : null}
      {result.status === 'error' ? <ErrorMessage>{result.message}</ErrorMessage> : null}
      {mine.state.status === 'error' ? (
        <Notice>فهرست مدل‌های دیگر شما بارگذاری نشد؛ فقط اجراهای همین مدل در دسترس است.</Notice>
      ) : null}

      {result.status === 'done' ? (
        <div aria-live="polite" className="flex flex-col gap-6">
          <p className="text-sm text-ink">
            <span className="font-bold">حالت «بدون طرح»:</span> {result.baseTitle}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {BASES.map((basis) => {
              const flow = result.outcome.analysis[basis];
              return (
                <IndicatorCard
                  key={basis}
                  title={`اثر طرح بر ${BASIS_LABELS_FA[basis]}`}
                  unit={unit}
                  unitLabel={unitLabel}
                  values={{
                    npv: flow.npv,
                    irr: flow.irr,
                    mirr: flow.mirr,
                    paybackMonths: flow.payback?.months,
                    dynamicPaybackMonths: flow.dynamicPayback?.months,
                  }}
                  rows={['npv', 'irr', 'mirr', 'payback', 'dynamicPayback']}
                  warnings={result.outcome.placed.filter((warning) => warning.basis === basis)}
                />
              );
            })}
          </div>
          <p className="text-[13px] text-ink-3">
            «ندارد» یعنی آن شاخص برای جریان نقد افزایشی قابل محاسبه نیست؛ دلیلش زیر همان شاخص آمده
            است.
          </p>
          {result.outcome.general.length > 0 ? (
            <Notice>
              <p className="font-bold">هشدارهای محاسبه</p>
              <ul className="list-disc ps-5">
                {result.outcome.general.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {BASES.map((basis) => (
            <div key={basis}>
              {table(() =>
                incrementalFlowTable(
                  result.outcome.analysis,
                  model.statements,
                  result.base.statements,
                  basis,
                ),
              )}
            </div>
          ))}
          {table(() => incrementalCashFlowTable(result.outcome.analysis))}
        </div>
      ) : null}
    </>
  );
}
