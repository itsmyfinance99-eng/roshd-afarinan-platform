'use client';

import type { ProjectInput } from '@roshd/financial-engine';
import { Button, ErrorMessage, FieldShell, Notice, Select, TextInput } from '@roshd/ui';
import { toPersianDigits, type ReportingUnit } from '@roshd/validation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ScenarioResult, SensitivityResult } from '@/lib/model-editor/analysis';
import {
  CHANGE_RANGE_FA,
  changeInRange,
  changeOf,
  MAX_ANALYSIS_RUNS,
  parseSteps,
  percentAsFraction,
  runAnalysis,
  sensitivityVariable,
  VARIABLE_LABELS_FA,
  variablesOf,
  type VariableKey,
} from '@/lib/model-editor/analysis-inputs';
import { BASIS_LABELS_FA, type Basis } from '@roshd/financial-report/warnings';
import { TornadoChart } from './charts';
import {
  amountText,
  changeText,
  INDICATOR_LABELS_FA,
  indicatorText,
  percentText,
  type IndicatorRowKey,
} from '@roshd/financial-report/indicators';

const MAX_SCENARIOS = 4;
const BASES: Basis[] = ['totalCapital', 'equity'];
const ROWS: IndicatorRowKey[] = ['npv', 'irr', 'mirr', 'payback', 'dynamicPayback'];

const cell = 'border-t border-line px-3 py-1.5 text-end whitespace-nowrap';
const head = 'bg-surface px-3 py-2 text-end font-semibold whitespace-nowrap text-ink-3';
const rowHead = 'border-t border-line px-3 py-1.5 text-start font-normal text-ink';
const field =
  'h-9 w-full rounded-control border border-line-strong bg-brand-700 px-2 text-sm text-ink disabled:opacity-60';

const RELATIVE_NOTE = 'تغییرها نسبی‌اند: ۱۰ درصد افزایش یک نرخ ۲۰ درصدی یعنی ۲۲ درصد، نه ۳۰ درصد.';

/**
 * One analysis at a time: `start` gives the signal of a new run and stops the one before it;
 * `stop` ends the current one. The panel going away stops it too.
 */
function useRunner() {
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return {
    start: () => {
      controller.current?.abort();
      controller.current = new AbortController();
      return controller.current.signal;
    },
    stop: () => controller.current?.abort(),
  };
}

function AmountNote({ unitLabel }: { unitLabel: string }) {
  return unitLabel ? (
    <span className="ms-2 text-xs font-normal text-ink-3">(مبلغ‌ها به {unitLabel})</span>
  ) : null;
}

interface PanelProps {
  input: ProjectInput;
  unit: ReportingUnit;
  /** e.g. «میلیون IRR». */
  unitLabel: string;
}

/**
 * One-variable sensitivity of a run: every chosen variable is changed by every step while the
 * others stay, and the whole model is calculated again each time.
 */
export function SensitivityPanel({ input, unit, unitLabel }: PanelProps) {
  const available = useMemo(() => variablesOf(input), [input]);
  const [chosen, setChosen] = useState<VariableKey[]>(available);
  const [steps, setSteps] = useState('');
  const [basis, setBasis] = useState<Basis>('totalCapital');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [stopped, setStopped] = useState(false);
  const [result, setResult] = useState<SensitivityResult | null>(null);
  const stepsId = useId();
  const basisId = useId();
  const runner = useRunner();

  const fail = (message: string) => {
    setError(message);
    setResult(null);
  };

  const calculate = async () => {
    const parsed = parseSteps(steps);
    if (!parsed.ok) return fail(parsed.message);
    if (chosen.length === 0) return fail('دست‌کم یک متغیر انتخاب کنید.');
    const runs = chosen.length * parsed.value.length;
    if (runs > MAX_ANALYSIS_RUNS) {
      return fail(
        `این تحلیل کل مدل را ${toPersianDigits(runs)} بار حساب می‌کند؛ حداکثر ${toPersianDigits(MAX_ANALYSIS_RUNS)} بار ممکن است. متغیر یا گام کمتری انتخاب کنید.`,
      );
    }
    setError(undefined);
    setStopped(false);
    setResult(null);
    setBusy(true);
    const signal = runner.start();
    const outcome = await runAnalysis(
      {
        kind: 'sensitivity',
        input,
        variables: chosen.map(sensitivityVariable),
        steps: parsed.value,
      },
      signal,
    );
    setBusy(false);
    if (signal.aborted) return setStopped(true);
    if (outcome.ok && outcome.result.kind === 'sensitivity') setResult(outcome.result);
    else if (!outcome.ok) {
      fail(`${outcome.message} یکی از گام‌ها برای یکی از متغیرهای انتخاب‌شده قابل محاسبه نیست.`);
    }
  };

  const label = (key: string) =>
    Object.hasOwn(VARIABLE_LABELS_FA, key) ? VARIABLE_LABELS_FA[key as VariableKey] : key;
  const bars = result?.tornado[basis] ?? [];
  const warnings =
    result?.variables.flatMap((variable) =>
      variable.points.flatMap((point) =>
        point.warnings.map(
          (warning) => `${label(variable.key)} ${changeText(point.change)}: ${warning}`,
        ),
      ),
    ) ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-bold text-ink">تحلیل حساسیت</h3>
        <p className="mt-1 text-sm leading-7 text-ink-3">
          هر متغیر به‌تنهایی به اندازه هر گام تغییر می‌کند و کل مدل دوباره حساب می‌شود.{' '}
          {RELATIVE_NOTE} نتیجه این تحلیل ذخیره نمی‌شود.
        </p>
      </div>
      <fieldset disabled={busy} className="flex flex-wrap gap-x-6 gap-y-2">
        <legend className="mb-2 text-sm font-semibold text-ink">متغیرها</legend>
        {available.map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-[18px] accent-primary"
              checked={chosen.includes(key)}
              onChange={(event) => {
                setResult(null);
                setChosen((current) =>
                  event.target.checked
                    ? available.filter((k) => k === key || current.includes(k))
                    : current.filter((k) => k !== key),
                );
              }}
            />
            {VARIABLE_LABELS_FA[key]}
          </label>
        ))}
      </fieldset>
      <div className="grid items-end gap-3 md:grid-cols-[1fr_auto]">
        <FieldShell
          id={stepsId}
          label="گام‌های تغییر (درصد)"
          required
          hint="درصدها را با فاصله یا ویرگول جدا کنید. نمونه شیوه نوشتن: ‎-۲۰  -۱۰  ۱۰  ۲۰"
        >
          <TextInput
            id={stepsId}
            hasHint
            dir="ltr"
            autoComplete="off"
            disabled={busy}
            value={steps}
            onChange={(event) => {
              setSteps(event.target.value);
              setResult(null);
            }}
          />
        </FieldShell>
        {busy ? (
          <Button variant="outline" size="xl" onClick={runner.stop}>
            توقف محاسبه
          </Button>
        ) : (
          <Button size="xl" onClick={() => void calculate()}>
            محاسبه حساسیت
          </Button>
        )}
      </div>
      <p role="status" className="min-h-6 text-sm text-ink-3">
        {busy
          ? 'در حال محاسبه… برای هر متغیر و هر گام، کل مدل دوباره حساب می‌شود.'
          : stopped
            ? 'محاسبه متوقف شد.'
            : ''}
      </p>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {result ? (
        <div className="flex flex-col gap-4">
          <FieldShell id={basisId} label="مبنای نمودار و جدول" className="max-w-xs">
            <Select
              id={basisId}
              value={basis}
              onChange={(event) => setBasis(event.target.value as Basis)}
            >
              {BASES.map((b) => (
                <option key={b} value={b}>
                  {BASIS_LABELS_FA[b]}
                </option>
              ))}
            </Select>
          </FieldShell>
          <TornadoChart
            title={`نمودار گردبادی حساسیت NPV ${BASIS_LABELS_FA[basis]}`}
            description={`هر میله دامنه NPV را از کمترین تا بیشترین تغییر یک متغیر نشان می‌دهد${
              unitLabel ? `، به ${unitLabel}` : ''
            }؛ پهن‌ترین میله ${
              bars[0] ? `«${label(bars[0].key)}»` : ''
            } است. ارقام در جدول زیر نمودار آمده است.`}
            base={result.base[basis].npv}
            rows={bars.map((bar) => ({ label: label(bar.key), low: bar.low, high: bar.high }))}
            format={(value) => amountText(value, unit)}
            unitLabel={unitLabel}
            formatChange={changeText}
          />
          <div
            role="region"
            aria-label="جدول حساسیت"
            tabIndex={0}
            className="relative overflow-x-auto rounded-card border border-line"
          >
            <table className="w-full border-collapse text-sm">
              <caption className="border-b border-line bg-surface px-3 py-2 text-start text-[15px] font-bold text-ink">
                حساسیت NPV و IRR {BASIS_LABELS_FA[basis]} به هر متغیر
                <AmountNote unitLabel={unitLabel} />
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={`${head} text-start`}>
                    متغیر
                  </th>
                  <th scope="col" className={`${head} text-start`}>
                    شاخص
                  </th>
                  <th scope="col" className={head}>
                    پایه
                  </th>
                  {(result.variables[0]?.points ?? []).map((point) => (
                    <th key={point.change} scope="col" className={head}>
                      {changeText(point.change)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.variables.flatMap((variable) =>
                  (['npv', 'irr'] as const).map((row) => (
                    <tr key={`${variable.key}-${row}`}>
                      <th scope="row" className={rowHead}>
                        {label(variable.key)}
                      </th>
                      <td className={`${cell} text-start`}>{row === 'npv' ? 'NPV' : 'IRR'}</td>
                      <td className={cell}>
                        {row === 'npv'
                          ? amountText(result.base[basis].npv, unit)
                          : percentText(result.base[basis].irr)}
                      </td>
                      {variable.points.map((point) => (
                        <td key={point.change} className={cell}>
                          {row === 'npv'
                            ? amountText(point.indicators[basis].npv, unit)
                            : percentText(point.indicators[basis].irr)}
                        </td>
                      ))}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {warnings.length > 0 ? (
            <Notice>
              <p className="font-bold">هشدارهایی که فقط در حالت‌های تغییریافته پیش می‌آید</p>
              <ul className="list-disc ps-5">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

interface ScenarioDraft {
  name: string;
  /** Percentage per variable as typed; empty = unchanged. */
  changes: Partial<Record<VariableKey, string>>;
}

/** Named sets of changes (e.g. optimistic and pessimistic) compared with the base case. */
export function ScenarioPanel({ input, unit, unitLabel }: PanelProps) {
  const available = useMemo(() => variablesOf(input), [input]);
  const [scenarios, setScenarios] = useState<ScenarioDraft[]>([{ name: '', changes: {} }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [stopped, setStopped] = useState(false);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const runner = useRunner();

  const update = (index: number, edit: (scenario: ScenarioDraft) => ScenarioDraft) => {
    setScenarios((current) => current.map((s, i) => (i === index ? edit(s) : s)));
    setResult(null);
  };
  const fail = (message: string) => {
    setError(message);
    setResult(null);
  };

  const calculate = async () => {
    const names = scenarios.map((s) => s.name.trim());
    if (names.some((name) => name === '')) return fail('برای هر سناریو نامی بنویسید.');
    if (new Set(names).size !== names.length) return fail('نام سناریوها نباید تکراری باشد.');
    const requests = [];
    for (const [index, scenario] of scenarios.entries()) {
      const changes = [];
      for (const key of available) {
        const typed = (scenario.changes[key] ?? '').trim();
        if (typed === '') continue;
        const fraction = percentAsFraction(typed);
        if (fraction === null) {
          return fail(
            `در سناریوی «${names[index]}»، درصد تغییر «${VARIABLE_LABELS_FA[key]}» عدد معتبری نیست.`,
          );
        }
        if (!changeInRange(typed)) {
          return fail(
            `در سناریوی «${names[index]}»، درصد تغییر «${VARIABLE_LABELS_FA[key]}» باید ${CHANGE_RANGE_FA} باشد.`,
          );
        }
        if (fraction !== '0') changes.push(changeOf(key, fraction));
      }
      if (changes.length === 0) {
        return fail(`سناریوی «${names[index]}» هیچ تغییری ندارد؛ دست‌کم یک درصد وارد کنید.`);
      }
      requests.push({ key: names[index] ?? '', changes });
    }
    setError(undefined);
    setStopped(false);
    setResult(null);
    setBusy(true);
    const signal = runner.start();
    const outcome = await runAnalysis({ kind: 'scenarios', input, scenarios: requests }, signal);
    setBusy(false);
    if (signal.aborted) return setStopped(true);
    if (outcome.ok && outcome.result.kind === 'scenarios') setResult(outcome.result);
    else if (!outcome.ok) fail(outcome.message);
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-bold text-ink">مقایسه سناریوها</h3>
        <p className="mt-1 text-sm leading-7 text-ink-3">
          هر سناریو مجموعه‌ای از تغییرهای درصدی نسبت به ورودی‌های همین اجراست (مثلاً خوش‌بینانه و
          بدبینانه). خانه خالی یعنی بدون تغییر. {RELATIVE_NOTE} سناریوها ذخیره نمی‌شوند.
        </p>
      </div>
      <div
        role="region"
        aria-label="تعریف سناریوها"
        tabIndex={0}
        className="relative overflow-x-auto rounded-card border border-line"
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">درصد تغییر هر متغیر در هر سناریو</caption>
          <thead>
            <tr>
              <th scope="col" className={`${head} text-start`}>
                متغیر (درصد تغییر)
              </th>
              {scenarios.map((scenario, index) => (
                <th key={index} scope="col" className={`${head} min-w-40`}>
                  <input
                    type="text"
                    aria-label={`نام سناریوی ${toPersianDigits(index + 1)}`}
                    placeholder="نام سناریو"
                    maxLength={40}
                    disabled={busy}
                    value={scenario.name}
                    onChange={(event) => update(index, (s) => ({ ...s, name: event.target.value }))}
                    className={`${field} font-normal`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {available.map((key) => (
              <tr key={key}>
                <th scope="row" className={rowHead}>
                  {VARIABLE_LABELS_FA[key]}
                </th>
                {scenarios.map((scenario, index) => (
                  <td key={index} className="border-t border-line p-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      autoComplete="off"
                      disabled={busy}
                      aria-label={`${VARIABLE_LABELS_FA[key]}، سناریوی ${
                        scenario.name.trim() || toPersianDigits(index + 1)
                      }`}
                      value={scenario.changes[key] ?? ''}
                      onChange={(event) =>
                        update(index, (s) => ({
                          ...s,
                          changes: { ...s.changes, [key]: event.target.value },
                        }))
                      }
                      className={`${field} text-right`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        {busy ? (
          <Button variant="outline" size="sm" onClick={runner.stop}>
            توقف محاسبه
          </Button>
        ) : (
          <Button size="sm" onClick={() => void calculate()}>
            محاسبه سناریوها
          </Button>
        )}
        {scenarios.length < MAX_SCENARIOS ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setScenarios((current) => [...current, { name: '', changes: {} }]);
              setResult(null);
            }}
          >
            افزودن سناریو
          </Button>
        ) : null}
        {scenarios.length > 1 ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setScenarios((current) => current.slice(0, -1));
              setResult(null);
            }}
          >
            حذف آخرین سناریو
          </Button>
        ) : null}
      </div>
      <p role="status" className="min-h-6 text-sm text-ink-3">
        {busy ? 'در حال محاسبه…' : stopped ? 'محاسبه متوقف شد.' : ''}
      </p>
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      {result ? (
        <>
          <div
            role="region"
            aria-label="مقایسه سناریوها با حالت پایه"
            tabIndex={0}
            className="relative overflow-x-auto rounded-card border border-line"
          >
            <table className="w-full border-collapse text-sm">
              <caption className="border-b border-line bg-surface px-3 py-2 text-start text-[15px] font-bold text-ink">
                شاخص‌ها در حالت پایه و در هر سناریو
                <AmountNote unitLabel={unitLabel} />
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={`${head} text-start`}>
                    شاخص
                  </th>
                  <th scope="col" className={head}>
                    پایه
                  </th>
                  {result.scenarios.map((scenario) => (
                    <th key={scenario.key} scope="col" className={head}>
                      {scenario.key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BASES.flatMap((basis) =>
                  ROWS.map((row) => (
                    <tr key={`${basis}-${row}`}>
                      <th scope="row" className={rowHead}>
                        {BASIS_LABELS_FA[basis]}: {INDICATOR_LABELS_FA[row]}
                      </th>
                      <td className={cell}>{indicatorText(row, result.base[basis], unit)}</td>
                      {result.scenarios.map((scenario) => (
                        <td key={scenario.key} className={cell}>
                          {indicatorText(row, scenario.indicators[basis], unit)}
                        </td>
                      ))}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {result.scenarios.some((scenario) => scenario.warnings.length > 0) ? (
            <Notice>
              <p className="font-bold">هشدارهای سناریوها</p>
              <ul className="list-disc ps-5">
                {result.scenarios.flatMap((scenario) =>
                  scenario.warnings.map((warning) => (
                    <li key={`${scenario.key}-${warning}`}>
                      «{scenario.key}»: {warning}
                    </li>
                  )),
                )}
              </ul>
            </Notice>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
