import {
  validateAnswer,
  validateAnswers,
  type AnswerValue,
  type Question,
  type QuestionnaireDefinition,
  type RequiredDocument,
} from '@roshd/validation';
import type { StaffRef } from '@/components/dashboard/types';

/**
 * The questionnaire of a project as its applicant fills it in (ST-35.05): what the API returns,
 * the steps of the form, how far it is, and which answers are ready to be saved.
 */

export type ProjectItem = {
  id: string;
  key: string;
  origin: 'applicant' | 'staff';
  createdAt: string;
  removable: boolean;
  /** Staff and experts only. */
  addedBy?: StaffRef | null;
} & (
  | { kind: 'QUESTION'; question: Question }
  | { kind: 'DOCUMENT'; document: RequiredDocument }
  | { kind: 'NOTE'; text: string }
);

/** Mirrors GET /api/v1/feasibility-projects/:id/questionnaire. */
export interface ProjectQuestionnaire {
  template: { id: string; title: string; version: number; isDemo: boolean } | null;
  definition: QuestionnaireDefinition | null;
  items: ProjectItem[];
  answers: Record<string, AnswerValue>;
  answeredAt: string | null;
  access: { start: boolean; answer: boolean; addItems: boolean };
}

/** What the form holds for a question while it is typed: not yet checked, maybe not valid. */
export type Draft = unknown;

export interface Step {
  key: string;
  title: string;
  description?: string;
  questions: Question[];
  /** The last step: what belongs to this project only, and the documents. */
  own?: boolean;
}

export const OWN_STEP_KEY = 'own';

/** The steps of the form: one per section, then the project's own items when there are any. */
export function stepsOf(questionnaire: ProjectQuestionnaire, withOwn: boolean): Step[] {
  const sections: Step[] = (questionnaire.definition?.sections ?? []).map((section) => ({
    key: section.key,
    title: section.title,
    ...(section.description ? { description: section.description } : {}),
    questions: section.questions,
  }));
  if (!withOwn) return sections;
  return [
    ...sections,
    {
      key: OWN_STEP_KEY,
      title: 'موارد اختصاصی و مدارک',
      questions: questionnaire.items.flatMap((item) =>
        item.kind === 'QUESTION' ? [item.question] : [],
      ),
      own: true,
    },
  ];
}

export const isAnswered = (value: AnswerValue | undefined): boolean =>
  value !== undefined && value !== null;

export interface Progress {
  answered: number;
  total: number;
  /** Required questions that still have no answer. */
  missing: number;
}

/** How many of these questions are answered, by what is saved. */
export function progressOf(
  questions: readonly Question[],
  answers: Record<string, AnswerValue>,
): Progress {
  let answered = 0;
  let missing = 0;
  for (const question of questions) {
    if (isAnswered(answers[question.key])) answered += 1;
    else if (question.required) missing += 1;
  }
  return { answered, total: questions.length, missing };
}

export interface Checked {
  /** Answers that passed their question, in the form the API stores. */
  valid: Record<string, AnswerValue>;
  /** Problems by path: the key of a question, or `key.row.column` in a table. */
  errors: Record<string, string>;
}

/**
 * Checks the answers that changed. Gaps are fine while the form is being filled in; what does
 * not fit its question is kept in the form with its message and is not sent.
 */
export function checkDrafts(
  questions: readonly Question[],
  drafts: Record<string, Draft>,
  keys: Iterable<string>,
): Checked {
  const byKey = new Map(questions.map((question) => [question.key, question]));
  const valid: Record<string, AnswerValue> = {};
  const errors: Record<string, string> = {};
  for (const key of keys) {
    const question = byKey.get(key);
    if (!question) continue;
    const result = validateAnswer(question, drafts[key] ?? null);
    if (result.ok) valid[key] = result.value;
    else for (const issue of result.issues) errors[issue.path] = issue.message;
  }
  return { valid, errors };
}

/** The problems the API reports for answers (`answers.<path>`), by the path the form uses. */
export function errorsFromDetails(
  details: readonly { path: string; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const detail of details) {
    if (detail.path.startsWith('answers.')) {
      errors[detail.path.slice('answers.'.length)] = detail.message;
    }
  }
  return errors;
}

/** The question a path of an error belongs to. */
export const questionOfPath = (path: string): string => path.split('.')[0] ?? path;

/** The first step that has a problem or a required question without an answer. */
export function firstOpenStep(
  steps: readonly Step[],
  answers: Record<string, AnswerValue>,
  errors: Record<string, string>,
): number {
  const wrong = new Set(Object.keys(errors).map(questionOfPath));
  const index = steps.findIndex((step) =>
    step.questions.some(
      (question) =>
        wrong.has(question.key) || (question.required && !isAnswered(answers[question.key])),
    ),
  );
  return index;
}

/**
 * What a submission would still ask for, by what is saved: required questions without an
 * answer, required cells and rows of a table, and answers that no longer fit their question.
 * By path, like the errors of the form.
 */
export function completeIssues(
  questions: readonly Question[],
  answers: Record<string, AnswerValue>,
): Record<string, string> {
  const keys = new Set(questions.map((question) => question.key));
  const known = Object.fromEntries(Object.entries(answers).filter(([key]) => keys.has(key)));
  const checked = validateAnswers(questions, known, { complete: true });
  return checked.ok
    ? {}
    : Object.fromEntries(checked.issues.map((issue) => [issue.path, issue.message]));
}
