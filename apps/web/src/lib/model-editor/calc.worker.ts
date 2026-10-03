import type { ProjectInput } from '@roshd/financial-engine';
import { calculate, type Outcome } from './summary';

/** Runs the engine off the main thread, so typing stays smooth while a model is calculated. */

export interface CalcRequest {
  id: number;
  input: ProjectInput;
}
export type CalcResponse = { id: number } & Outcome;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CalcRequest>) => void) | null;
  postMessage: (message: CalcResponse) => void;
};

scope.onmessage = (event) => {
  const { id, input } = event.data;
  scope.postMessage({ id, ...calculate(input) });
};
