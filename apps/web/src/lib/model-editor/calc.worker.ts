import type { ProjectInput } from '@roshd/financial-engine';
import { analyse, type AnalysisOutcome, type AnalysisRequest } from './analysis';
import { calculate, type Outcome } from './summary';

/** Runs the engine off the main thread, so the page stays responsive while a model is calculated. */

export interface CalcRequest {
  id: number;
  input: ProjectInput;
}
export type CalcResponse = { id: number } & Outcome;

/** An analysis of a stored run (scenarios, sensitivity). */
export interface AnalysisMessage {
  id: number;
  analysis: AnalysisRequest;
}
export type AnalysisResponse = { id: number } & AnalysisOutcome;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CalcRequest | AnalysisMessage>) => void) | null;
  postMessage: (message: CalcResponse | AnalysisResponse) => void;
};

scope.onmessage = (event) => {
  const message = event.data;
  if ('analysis' in message) {
    scope.postMessage({ id: message.id, ...analyse(message.analysis) });
  } else {
    scope.postMessage({ id: message.id, ...calculate(message.input) });
  }
};
