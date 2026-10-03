import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  EngineInputError,
  type CalculationResult,
  type EngineMessageCode,
  type ProjectInput,
  type ProjectModel,
} from '@roshd/financial-engine';
import {
  CalculationBusyError,
  CalculationTimeoutError,
  type CalculationRunner,
} from '../ports/calculation-runner';

/** Longest a single calculation may run before its worker is stopped. */
export const CALCULATION_TIMEOUT_MS = 5_000;
/** Calculations in the queue, the running one included; more are turned away. */
export const CALCULATION_QUEUE_LIMIT = 8;

/**
 * The worker: loads the engine (plain CommonJS, no framework) and runs one model. An input error
 * is sent back as data, because class instances do not survive the thread boundary.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const engine = require(workerData.enginePath);
try {
  parentPort.postMessage({ ok: true, result: engine.projectModel(workerData.input) });
} catch (error) {
  if (engine.isEngineInputError(error)) {
    parentPort.postMessage({
      ok: false,
      inputError: { code: error.code, field: error.field, params: error.params },
    });
  } else {
    parentPort.postMessage({ ok: false, message: String(error && error.message) });
  }
}
`;

type WorkerMessage =
  | { ok: true; result: CalculationResult<ProjectModel> }
  | {
      ok: false;
      inputError?: { code: EngineMessageCode; field: string; params: Record<string, string> };
      message?: string;
    };

/**
 * Runs each calculation in a worker thread, one at a time per API process, with a time budget.
 * The request thread stays free, a runaway model is stopped, and a burst of calculations queues
 * up to a limit instead of piling onto the CPU.
 */
@Injectable()
export class WorkerCalculationRunner implements CalculationRunner, OnModuleDestroy {
  private readonly enginePath = createRequire(__filename).resolve('@roshd/financial-engine');
  private readonly workers = new Set<Worker>();
  private tail: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  private closed = false;

  run(input: ProjectInput): Promise<CalculationResult<ProjectModel>> {
    if (this.closed || this.waiting >= CALCULATION_QUEUE_LIMIT) {
      return Promise.reject(new CalculationBusyError());
    }
    this.waiting += 1;
    const next = this.tail.then(() => {
      // Queued runs are dropped once the module is shutting down.
      if (this.closed) throw new CalculationBusyError();
      return this.runInWorker(input);
    });
    // The queue moves on whether this run succeeds or fails.
    this.tail = next
      .catch(() => undefined)
      .finally(() => {
        this.waiting -= 1;
      });
    return next;
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.workers].map((worker) => worker.terminate()));
  }

  private runInWorker(input: ProjectInput): Promise<CalculationResult<ProjectModel>> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { enginePath: this.enginePath, input },
        resourceLimits: { maxOldGenerationSizeMb: 256 },
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
        () => settle(() => reject(new CalculationTimeoutError())),
        CALCULATION_TIMEOUT_MS,
      );
      worker.once('message', (message: WorkerMessage) => {
        settle(() => {
          if (message.ok) resolve(message.result);
          else if (message.inputError) {
            const { code, field, params } = message.inputError;
            reject(new EngineInputError(code, field, params));
          } else reject(new Error(`calculation failed: ${message.message ?? 'unknown error'}`));
        });
      });
      worker.once('error', (error: Error & { code?: string }) =>
        settle(() =>
          // A model that outgrows the worker's memory is over budget like one that runs too long.
          reject(error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? new CalculationTimeoutError() : error),
        ),
      );
      worker.once('exit', (code) =>
        settle(() => reject(new Error(`calculation worker exited with code ${code}`))),
      );
    });
  }
}
