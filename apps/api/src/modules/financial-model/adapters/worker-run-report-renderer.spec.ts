import type { RunReportSource } from '@roshd/financial-report';
import { renderRunReport } from '@roshd/financial-report/render';
import { afterAll, describe, expect, it } from 'vitest';
import { RenderBusyError } from '../ports/run-report-renderer';
import { RENDER_QUEUE_LIMIT, WorkerRunReportRenderer } from './worker-run-report-renderer';

// A run whose stored results this version cannot read: the report still has its first page.
const source: RunReportSource = {
  modelTitle: 'طرح فولاد',
  run: {
    number: 1,
    modelVersion: 1,
    engineVersion: '0.1.0',
    inputHash: 'f'.repeat(64),
    createdAt: new Date('2026-09-11T20:45:00Z'),
    approvedAt: null,
  },
  input: {},
  results: null,
  warnings: [],
  defaultsUsed: [],
  unit: '1',
};

describe('WorkerRunReportRenderer', () => {
  const renderer = new WorkerRunReportRenderer();

  afterAll(async () => {
    await renderer.onModuleDestroy();
  });

  it('writes the same file as the report package called directly', async () => {
    const html = await renderer.render(source, 'html');
    const direct = Buffer.from(await renderRunReport(source, 'html'));
    // The footer names the minute the file was made in.
    const stable = (file: Buffer) => file.toString('utf8').replace(/<footer>.*<\/footer>/s, '');
    expect(stable(html)).toBe(stable(direct));
    expect(html.toString('utf8')).toContain('طرح فولاد');
  });

  it('writes a workbook and a PDF', async () => {
    const xlsx = await renderer.render(source, 'xlsx');
    expect(xlsx.subarray(0, 2).toString('latin1')).toBe('PK');
    const pdf = await renderer.render(source, 'pdf');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('writes the PDF of a study, the same bytes for the same version', async () => {
    const study = {
      project: { code: 'FS-1', title: 'طرح فولاد', sector: null, location: null },
      version: { number: 1, issuedAt: '2026-10-07T07:30:00.000Z', contentHash: 'f'.repeat(64) },
      chapters: [{ title: 'خلاصه', body: 'متن **خلاصه**', answers: [] }],
    };
    const first = await renderer.renderStudy(study);
    expect(first.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((await renderer.renderStudy(study)).equals(first)).toBe(true);
    const later = { ...study, version: { ...study.version, issuedAt: '2026-10-08T07:30:00Z' } };
    expect((await renderer.renderStudy(later)).equals(first)).toBe(false);
  });

  it('writes queued files in turn and turns away a burst beyond the queue', async () => {
    const attempts = Array.from({ length: RENDER_QUEUE_LIMIT + 2 }, () =>
      renderer.render(source, 'html').then(
        () => 'done',
        (e: unknown) => (e instanceof RenderBusyError ? 'busy' : 'failed'),
      ),
    );
    const outcomes = await Promise.all(attempts);
    expect(outcomes.filter((o) => o === 'done')).toHaveLength(RENDER_QUEUE_LIMIT);
    expect(outcomes.filter((o) => o === 'busy')).toHaveLength(2);
    // The queue is free again afterwards.
    await expect(renderer.render(source, 'html')).resolves.toBeDefined();
  });

  it('drops queued files and accepts none once the module is shutting down', async () => {
    const closing = new WorkerRunReportRenderer();
    const queued = [closing.render(source, 'html'), closing.render(source, 'html')].map((file) =>
      file.then(
        () => 'done',
        (e: unknown) => (e instanceof RenderBusyError ? 'busy' : 'stopped'),
      ),
    );
    await closing.onModuleDestroy();
    // The first was already in its worker; the second never starts.
    expect((await Promise.all(queued))[1]).toBe('busy');
    await expect(closing.render(source, 'html')).rejects.toBeInstanceOf(RenderBusyError);
  });
});
