'use client';

import { useEffect, useRef, useState } from 'react';
import type { CalcRequest, CalcResponse } from './calc.worker';
import { checkDraft, describeIssue, enginePath, type Issue } from './issues';
import type { Draft } from './paths';
import type { Summary } from './summary';

export type LiveState =
  /** The inputs are not complete yet: `issues` lists what a calculation needs. */
  (
    | { status: 'incomplete'; issues: Issue[] }
    | { status: 'calculating'; issues: Issue[] }
    | { status: 'done'; issues: Issue[]; summary: Summary }
    /** The engine could not be started in this browser. */
    | { status: 'unavailable'; issues: Issue[] }
  ) & {
    /** The draft this state was computed for; it is out of date while that is not the current one. */
    input: Draft | null;
  };

const DELAY_MS = 350;

/**
 * Checks the draft and calculates it in a worker a moment after the last change. A calculation
 * still running when the inputs change again is stopped, so the result always belongs to what is
 * on screen.
 */
export function useLiveCalculation(draft: Draft): LiveState {
  const [state, setState] = useState<LiveState>({ status: 'calculating', issues: [], input: null });
  const worker = useRef<Worker | null>(null);
  const busy = useRef(false);
  const request = useRef(0);

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      const id = (request.current += 1);
      // A calculation of older inputs is of no use any more.
      if (busy.current) {
        worker.current?.terminate();
        worker.current = null;
        busy.current = false;
      }
      const check = checkDraft(draft);
      if (!check.ok) {
        setState({ status: 'incomplete', issues: check.issues, input: draft });
        return;
      }
      try {
        worker.current ??= new Worker(new URL('./calc.worker.ts', import.meta.url));
      } catch {
        setState({ status: 'unavailable', issues: [], input: draft });
        return;
      }
      const current = worker.current;
      current.onmessage = (event: MessageEvent<CalcResponse>) => {
        if (event.data.id !== request.current) return;
        busy.current = false;
        const outcome = event.data;
        if (outcome.ok) {
          setState({ status: 'done', issues: [], summary: outcome.summary, input: draft });
        } else {
          const path = outcome.field === undefined ? '' : enginePath(outcome.field);
          setState({
            status: 'incomplete',
            issues: [describeIssue(path, outcome.message, draft)],
            input: draft,
          });
        }
      };
      current.onerror = () => {
        busy.current = false;
        worker.current?.terminate();
        worker.current = null;
        setState({ status: 'unavailable', issues: [], input: draft });
      };
      busy.current = true;
      setState({ status: 'calculating', issues: [], input: draft });
      current.postMessage({ id, input: check.input } satisfies CalcRequest);
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  return state;
}
