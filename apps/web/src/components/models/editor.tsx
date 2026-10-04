'use client';

import { Button, cn, ErrorMessage, FieldShell, Notice, SuccessMessage, TextInput } from '@roshd/ui';
import { toPersianDigits } from '@roshd/validation';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { apiFetch, saveBlob } from '@/lib/api-client';
import { canonical, withStructure } from '@/lib/model-editor/draft-ops';
import { frameOf, resizeDraft } from '@/lib/model-editor/frame';
import { SECTION_LABELS_FA, SECTIONS, type Issue, type SectionId } from '@/lib/model-editor/issues';
import { formatDecimalFa, fractionToPercent, roundDecimal } from '@/lib/model-editor/numbers';
import { getIn, setIn, textAt, type Draft, type Path } from '@/lib/model-editor/paths';
import type { Indicators } from '@/lib/model-editor/summary';
import { useLiveCalculation, type LiveState } from '@/lib/model-editor/use-live-calculation';
import { AssumptionsSection } from './assumptions';
import { CostsSection } from './costs';
import { EditorProvider, type EditorApi } from './fields';
import { FinancingSection } from './financing';
import { InvestmentSection } from './investment';
import { SalesSection } from './sales';
import { StartingBalanceSection } from './starting-balance';
import type { CalculationRunRef, FinancialModelDetail } from './types';
import { WorkingCapitalSection } from './working-capital';

const SAVE_DELAY_MS = 1500;
const MAX_LISTED_ISSUES = 8;

const PANELS: Record<SectionId, () => React.JSX.Element> = {
  assumptions: AssumptionsSection,
  investment: InvestmentSection,
  financing: FinancingSection,
  sales: SalesSection,
  costs: CostsSection,
  workingCapital: WorkingCapitalSection,
  startingBalance: StartingBalanceSection,
};

type SaveFailure = { kind: 'conflict' } | { kind: 'error'; message: string };

/**
 * Editor of a financial model's inputs (ST-34.07): six sections of tabular forms, saved on their
 * own a moment after every change (on top of the version that was loaded), and calculated live in
 * the browser with the same engine the server runs.
 */
export function ModelEditor({
  model,
  onReload,
}: {
  model: FinancialModelDetail;
  onReload: () => void;
}) {
  const [title, setTitle] = useState(model.title);
  const [draft, setDraft] = useState<Draft>(() => {
    // A stored draft whose series do not fit its own horizon is brought to it once, at the end.
    const loaded = withStructure(model.inputs);
    const frame = frameOf(loaded);
    return frame ? resizeDraft(loaded, frame) : loaded;
  });
  /** The horizon as it is being edited; the model follows it when it is applied. */
  const [pendingHorizon, setPendingHorizon] = useState<unknown>(() =>
    getIn(withStructure(model.inputs), ['horizon']),
  );
  const [section, setSection] = useState<SectionId>('assumptions');
  /** Counts the changes; a save records the revision it stored. */
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [run, setRun] = useState<
    | { status: 'idle' }
    | { status: 'busy' }
    | { status: 'done'; number: number; id: string }
    | { status: 'failed'; message: string; details: string[] }
  >({ status: 'idle' });

  const version = useRef(model.version);
  const stored = useRef(0);
  const latest = useRef({ title, draft, revision });
  const inFlight = useRef<Promise<boolean> | null>(null);
  const blocked = useRef(false);
  /** The last valid title: the inputs are saved with it while the typed one is not valid. */
  const goodTitle = useRef(model.title);
  /**
   * Saves that failed without an answer since the last one that was accepted: the server may or
   * may not have stored any of them.
   */
  const unanswered = useRef<{ title: string; inputs: string }[]>([]);
  useEffect(() => {
    latest.current = { title, draft, revision };
  });

  const titleError =
    title.trim().length < 3
      ? 'عنوان مدل حداقل سه نویسه است.'
      : title.trim().length > 150
        ? 'عنوان مدل حداکثر ۱۵۰ نویسه است.'
        : undefined;

  /** Saves until what is on screen is stored; false when a save was refused. */
  const flush = useCallback(async (): Promise<boolean> => {
    for (;;) {
      while (inFlight.current) await inFlight.current;
      const snapshot = latest.current;
      if (snapshot.revision === stored.current) return true;
      if (blocked.current) return false;
      const typed = snapshot.title.trim();
      if (typed.length >= 3 && typed.length <= 150) goodTitle.current = typed;
      const name = goodTitle.current;
      const url = `/financial-models/${model.id}`;
      const accept = (saved: number) => {
        version.current = saved;
        stored.current = snapshot.revision;
        setSavedRevision(snapshot.revision);
        setFailure(null);
        return true;
      };
      setSaving(true);
      const request = apiFetch<FinancialModelDetail>(url, {
        method: 'PUT',
        body: { title: name, inputs: snapshot.draft, version: version.current },
      })
        .then(async (result) => {
          if (result.ok) {
            unanswered.current = [];
            return accept(result.data.version);
          }
          if (result.status !== 409) {
            // No answer, or a server error: the save may have been stored all the same.
            if (result.status === 0 || result.status >= 500) {
              unanswered.current.push({ title: name, inputs: canonical(snapshot.draft) });
            }
            setFailure({ kind: 'error', message: result.message });
            return false;
          }
          // A save whose answer was lost looks like a conflict. When the server holds exactly
          // what this editor sent — now, or in the save that got no answer — nobody else changed
          // the model: the editor takes the server's version and goes on.
          const server = await apiFetch<FinancialModelDetail>(url);
          if (server.ok) {
            const held = canonical(server.data.inputs);
            if (server.data.title === name && held === canonical(snapshot.draft)) {
              unanswered.current = [];
              return accept(server.data.version);
            }
            const own = unanswered.current.some(
              (lost) => server.data.title === lost.title && held === lost.inputs,
            );
            if (own) {
              unanswered.current = [];
              version.current = server.data.version;
              setFailure(null);
              // Not stored yet: the loop sends the current state on top of that version.
              return true;
            }
          }
          blocked.current = true;
          setFailure({ kind: 'conflict' });
          return false;
        })
        .finally(() => {
          inFlight.current = null;
          setSaving(false);
        });
      inFlight.current = request;
      if (!(await request)) return false;
    }
  }, [model.id]);

  useEffect(() => {
    if (revision === stored.current) return;
    const timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [revision, flush]);

  const dirty = revision !== savedRevision;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  // Leaving the editor inside the app: store what is still pending.
  useEffect(() => () => void flush(), [flush]);

  const change = useCallback((edit: (current: Draft) => Draft) => {
    setDraft(edit);
    setRevision((count) => count + 1);
    setRun((state) => (state.status === 'busy' ? state : { status: 'idle' }));
  }, []);
  const set = useCallback(
    (path: Path, value: unknown) => change((current) => setIn(current, path, value)),
    [change],
  );

  const horizon = getIn(draft, ['horizon']);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the frame depends on the horizon only
  const frame = useMemo(() => frameOf(draft), [horizon]);
  const live = useLiveCalculation(draft);
  const issues = useMemo(
    () => new Map(live.issues.map((issue) => [issue.path, issue.message])),
    [live.issues],
  );
  const staging = useMemo<EditorApi['staging']>(
    () => ({
      horizon: pendingHorizon,
      setHorizon: (path, value) =>
        setPendingHorizon((current: unknown) => setIn(current, path, value)),
      resetHorizon: () => setPendingHorizon(horizon),
      // Values stay with the periods that cover the same time; see `resizeDraft`.
      applyHorizon: () =>
        change((current) => {
          const next = setIn(current, ['horizon'], pendingHorizon);
          const applied = frameOf(next);
          return applied ? resizeDraft(next, applied, frameOf(current)) : next;
        }),
    }),
    [pendingHorizon, horizon, change],
  );
  const api = useMemo<EditorApi>(
    () => ({ draft, frame, issues, set, change, staging }),
    [draft, frame, issues, set, change, staging],
  );
  /** The live result belongs to what is on screen (it lags a moment behind every change). */
  const fresh = live.input === draft;
  const counts = useMemo(() => {
    const bySection = new Map<SectionId, number>();
    for (const issue of live.issues) {
      bySection.set(issue.section, (bySection.get(issue.section) ?? 0) + 1);
    }
    return bySection;
  }, [live.issues]);

  const calculate = async () => {
    setRun({ status: 'busy' });
    if (!(await flush())) {
      setRun({
        status: 'failed',
        message: 'پیش از محاسبه، ذخیره مدل انجام نشد. پیام ذخیره را ببینید.',
        details: [],
      });
      return;
    }
    const result = await apiFetch<CalculationRunRef>(`/financial-models/${model.id}/runs`, {
      method: 'POST',
    });
    setRun(
      result.ok
        ? { status: 'done', number: result.data.number, id: result.data.id }
        : {
            status: 'failed',
            message: result.message,
            details: result.details.slice(0, MAX_LISTED_ISSUES).map((detail) => detail.message),
          },
    );
  };

  const titleId = useId();
  const tabsId = useId();
  const Panel = PANELS[section];
  const moveTab = (event: KeyboardEvent<HTMLDivElement>) => {
    // Tabs read right to left: the next one is on the left.
    const step = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = (SECTIONS.indexOf(section) + step + SECTIONS.length) % SECTIONS.length;
    const next = SECTIONS[index] ?? 'assumptions';
    setSection(next);
    document.getElementById(`${tabsId}-tab-${next}`)?.focus();
  };

  return (
    <EditorProvider value={api}>
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <FieldShell id={titleId} label="عنوان مدل" required error={titleError}>
            <TextInput
              id={titleId}
              error={titleError}
              maxLength={150}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setRevision((count) => count + 1);
              }}
            />
          </FieldShell>
          <SaveStatus
            saving={saving}
            dirty={dirty}
            failure={failure}
            onRetry={() => void flush()}
            onReload={onReload}
            onExport={() =>
              saveBlob(
                new Blob([JSON.stringify({ title, inputs: draft }, null, 2)], {
                  type: 'application/json',
                }),
                'model-inputs.json',
              )
            }
          />
        </div>

        <LivePanel
          modelId={model.id}
          live={live}
          fresh={fresh}
          currency={textAt(draft, ['localCurrency'])}
          onGo={setSection}
          run={run}
          onCalculate={() => void calculate()}
        />

        <div
          role="tablist"
          aria-label="بخش‌های ورودی مدل"
          onKeyDown={moveTab}
          className="relative flex gap-2 overflow-x-auto border-b border-line pb-px"
        >
          {SECTIONS.map((id) => {
            const selected = id === section;
            const count = counts.get(id) ?? 0;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${tabsId}-tab-${id}`}
                aria-selected={selected}
                aria-controls={`${tabsId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setSection(id)}
                className={cn(
                  'shrink-0 rounded-t-control border-b-2 px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors',
                  selected
                    ? 'border-primary text-ink'
                    : 'border-transparent text-ink-3 hover:text-ink',
                )}
              >
                {SECTION_LABELS_FA[id]}
                {count > 0 ? (
                  <span className="ms-2 inline-block min-w-5 rounded-chip bg-notice-bg px-1.5 text-xs text-notice-fg">
                    <span className="sr-only">، </span>
                    {toPersianDigits(count)}
                    <span className="sr-only"> مورد ناقص</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div
          role="tabpanel"
          id={`${tabsId}-panel`}
          aria-labelledby={`${tabsId}-tab-${section}`}
          className="flex flex-col gap-6"
        >
          <h2 className="sr-only">{SECTION_LABELS_FA[section]}</h2>
          <Panel />
        </div>
      </div>
    </EditorProvider>
  );
}

function SaveStatus({
  saving,
  dirty,
  failure,
  onRetry,
  onReload,
  onExport,
}: {
  saving: boolean;
  dirty: boolean;
  failure: SaveFailure | null;
  onRetry: () => void;
  onReload: () => void;
  onExport: () => void;
}) {
  if (failure?.kind === 'conflict') {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm text-danger">
        این مدل در جای دیگری تغییر کرده است؛ تغییرهای این صفحه ذخیره نمی‌شود. اگر به آن‌ها نیاز
        دارید، پیش از بارگذاری نسخه تازه یک رونوشت بگیرید.
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onExport}>
            دریافت رونوشت این صفحه
          </Button>
          <Button variant="outline" size="sm" onClick={onReload}>
            بارگذاری نسخه تازه
          </Button>
        </div>
      </div>
    );
  }
  if (failure && !saving) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm text-danger">
        ذخیره نشد: {failure.message} تا ذخیره نشده از این صفحه بیرون نروید.
        <Button variant="outline" size="sm" onClick={onRetry}>
          تلاش دوباره
        </Button>
      </div>
    );
  }
  return (
    <p role="status" aria-live="polite" className="pb-3 text-sm text-ink-3">
      {saving ? 'در حال ذخیره…' : dirty ? 'تغییرها ذخیره نشده‌اند…' : 'همه تغییرها ذخیره شد.'}
    </p>
  );
}

const money = (value: string, currency: string) => (
  <>
    <bdi dir="ltr">{formatDecimalFa(roundDecimal(value, 0))}</bdi>
    {currency ? ` ${currency}` : ''}
  </>
);
const percent = (value: string | undefined) =>
  value === undefined
    ? 'ندارد'
    : `\u2066${formatDecimalFa(roundDecimal(fractionToPercent(value), 2))}\u2069 درصد`;

function duration(months: string | undefined): string {
  if (months === undefined) return 'ندارد';
  const total = Math.round(Number(months));
  const years = Math.floor(total / 12);
  const rest = total % 12;
  const parts = [
    years > 0 ? `${toPersianDigits(years)} سال` : '',
    rest > 0 || years === 0 ? `${toPersianDigits(rest)} ماه` : '',
  ].filter((part) => part !== '');
  return parts.join(' و ');
}

function IndicatorList({
  title,
  value,
  currency,
}: {
  title: string;
  value: Indicators;
  currency: string;
}) {
  const rows: [string, ReactNode][] = [
    ['ارزش فعلی خالص (NPV)', money(value.npv, currency)],
    ['نرخ بازده داخلی (IRR)', percent(value.irr)],
    ['نرخ بازده داخلی تعدیل‌شده (MIRR)', percent(value.mirr)],
    ['دوره بازگشت سرمایه از آغاز طرح', duration(value.paybackMonths)],
    ['دوره بازگشت تنزیلی از آغاز طرح', duration(value.dynamicPaybackMonths)],
  ];
  return (
    <div className="rounded-card bg-surface p-4">
      <h3 className="mb-3 text-[15px] font-bold text-ink">{title}</h3>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, text]) => (
          <div key={label} className="contents">
            <dt className="text-ink-3">{label}</dt>
            <dd className="font-bold text-ink">{text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function IssueList({ issues, onGo }: { issues: Issue[]; onGo: (section: SectionId) => void }) {
  const listed = issues.slice(0, MAX_LISTED_ISSUES);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold text-ink">
        برای محاسبه هنوز {toPersianDigits(issues.length)} مورد لازم است:
      </p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {listed.map((issue) => (
          <li key={issue.path}>
            <button
              type="button"
              className="block text-start text-accent underline"
              onClick={() => onGo(issue.section)}
            >
              {SECTION_LABELS_FA[issue.section]}
              {issue.label ? ` › ${issue.label}` : ''}
            </button>
            <span className="block text-ink-3">{issue.message}</span>
          </li>
        ))}
      </ul>
      {issues.length > listed.length ? (
        <p className="text-sm text-ink-3">
          و {toPersianDigits(issues.length - listed.length)} مورد دیگر؛ تعداد هر بخش کنار نام آن
          آمده است.
        </p>
      ) : null}
    </div>
  );
}

function LivePanel({
  modelId,
  live,
  fresh,
  currency,
  onGo,
  run,
  onCalculate,
}: {
  modelId: string;
  live: LiveState;
  fresh: boolean;
  currency: string;
  onGo: (section: SectionId) => void;
  run:
    | { status: 'idle' }
    | { status: 'busy' }
    | { status: 'done'; number: number; id: string }
    | { status: 'failed'; message: string; details: string[] };
  onCalculate: () => void;
}) {
  return (
    <section
      aria-labelledby="live-result"
      className="flex flex-col gap-4 rounded-panel border border-line p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="live-result" className="text-lg font-bold text-ink">
          نتیجه زنده
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/dashboard/models/${modelId}/runs`} className="text-sm">
            اجراها و نتایج
          </Link>
          <Button
            size="sm"
            disabled={run.status === 'busy' || !fresh || live.status !== 'done'}
            onClick={onCalculate}
          >
            {run.status === 'busy' ? 'در حال ثبت…' : 'ثبت اجرای محاسبه'}
          </Button>
        </div>
      </div>
      <p role="status" className="min-h-6 text-sm text-ink-3">
        {!fresh || live.status === 'calculating' ? 'در حال محاسبه…' : ''}
      </p>
      <div className={cn('flex flex-col gap-4', fresh ? '' : 'opacity-60')}>
        {live.status === 'unavailable' ? (
          <Notice>
            محاسبه زنده در این مرورگر در دسترس نیست. ورودی‌ها ذخیره می‌شوند و با «ثبت اجرای محاسبه»
            روی سرور حساب می‌شوند.
          </Notice>
        ) : null}
        {live.issues.length > 0 ? <IssueList issues={live.issues} onGo={onGo} /> : null}
        {live.status === 'done' ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <IndicatorList
                title="کل سرمایه"
                value={live.summary.totalCapital}
                currency={currency}
              />
              <IndicatorList title="آورده" value={live.summary.equity} currency={currency} />
            </div>
            {live.summary.warnings.length > 0 ? (
              <Notice>
                <p className="font-bold">هشدارهای محاسبه</p>
                <ul className="list-disc ps-5">
                  {live.summary.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            {live.summary.defaults.length > 0 ? (
              <p className="text-[13px] leading-7 text-ink-3">
                پیش‌فرض‌های COMFAR که چون خالی گذاشته‌اید به کار رفت:{' '}
                {live.summary.defaults.join('؛ ')}.
              </p>
            ) : null}
            <p className="text-[12.5px] text-ink-3">
              این نتیجه ذخیره نمی‌شود و با هر تغییر دوباره حساب می‌شود؛ برای نگه‌داشتن آن «ثبت اجرای
              محاسبه» را بزنید. نسخه موتور: <span dir="ltr">{live.summary.engineVersion}</span>
            </p>
          </>
        ) : null}
      </div>
      {run.status === 'done' ? (
        <SuccessMessage>
          اجرای شماره {toPersianDigits(run.number)} ثبت شد.{' '}
          <Link href={`/dashboard/models/${modelId}/runs/${run.id}`}>
            دیدن صورت‌ها و نتایج کامل
          </Link>
        </SuccessMessage>
      ) : null}
      {run.status === 'failed' ? (
        <ErrorMessage>
          {run.message}
          {run.details.length > 0 ? (
            <ul className="mt-2 list-disc ps-5 text-sm">
              {run.details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </ErrorMessage>
      ) : null}
    </section>
  );
}
