import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { RunReportSource } from '@roshd/financial-report';
import { reportFonts } from '@roshd/financial-report/fonts';
import type { CalculationExportFormat } from '@roshd/validation';
import {
  RenderBusyError,
  RenderTimeoutError,
  type RunReportRenderer,
} from '../ports/run-report-renderer';

/** Longest one file may take before its worker is stopped. */
export const RENDER_TIMEOUT_MS = 30_000;
/** Files in the queue, the one being written included; more are turned away. */
export const RENDER_QUEUE_LIMIT = 4;

/**
 * The worker: loads the report package (plain CommonJS, no framework) and writes one file. The
 * bytes are handed over without copying.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { renderRunReport } = require(workerData.renderPath);
renderRunReport(workerData.source, workerData.format).then(
  (file) => {
    const bytes = new Uint8Array(file);
    parentPort.postMessage({ ok: true, bytes }, [bytes.buffer]);
  },
  (error) => parentPort.postMessage({ ok: false, message: String(error && error.message) }),
);
`;

type WorkerMessage = { ok: true; bytes: Uint8Array } | { ok: false; message?: string };

/**
 * Writes each file in a worker thread, one at a time per API process, with a time budget — like
 * the calculation itself (`WorkerCalculationRunner`). The request thread stays free, a report
 * that takes too long is stopped, and a burst of downloads queues up to a limit.
 */
@Injectable()
export class WorkerRunReportRenderer implements RunReportRenderer, OnModuleInit, OnModuleDestroy {
  private readonly renderPath = createRequire(__filename).resolve('@roshd/financial-report/render');
  private readonly workers = new Set<Worker>();
  private tail: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  private closed = false;

  render(source: RunReportSource, format: CalculationExportFormat): Promise<Buffer> {
    if (this.closed || this.waiting >= RENDER_QUEUE_LIMIT) {
      return Promise.reject(new RenderBusyError());
    }
    this.waiting += 1;
    const next = this.tail.then(() => {
      // Queued files are dropped once the module is shutting down.
      if (this.closed) throw new RenderBusyError();
      return this.renderInWorker(source, format);
    });
    // The queue moves on whether this file succeeds or fails.
    this.tail = next
      .catch(() => undefined)
      .finally(() => {
        this.waiting -= 1;
      });
    return next;
  }

  /**
   * The font files ship with the report package. Reading them when the API starts makes an
   * image that lacks them fail at once, not at the first download.
   */
  onModuleInit(): void {
    reportFonts();
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.workers].map((worker) => worker.terminate()));
  }

  private renderInWorker(source: RunReportSource, format: CalculationExportFormat) {
    return new Promise<Buffer>((resolve, reject) => {
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { renderPath: this.renderPath, source, format },
        resourceLimits: { maxOldGenerationSizeMb: 512 },
      });
      this.workers.add(worker);
      let settled = false;
      const settle = (finish: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.workers.delete(worker);
        void worker.terminate();
        finish();
      };
      const timer = setTimeout(
        () => settle(() => reject(new RenderTimeoutError())),
        RENDER_TIMEOUT_MS,
      );
      worker.once('message', (message: WorkerMessage) => {
        settle(() => {
          if (message.ok) resolve(Buffer.from(message.bytes));
          else reject(new Error(`rendering failed: ${message.message ?? 'unknown error'}`));
        });
      });
      worker.once('error', (error: Error & { code?: string }) =>
        settle(() =>
          // A report that outgrows the worker's memory is over budget like one that takes too long.
          reject(error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? new RenderTimeoutError() : error),
        ),
      );
      worker.once('exit', (code) =>
        settle(() => reject(new Error(`report worker exited with code ${code}`))),
      );
    });
  }
}
