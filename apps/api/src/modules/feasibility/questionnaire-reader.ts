import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  PROJECT_ITEM_KEY_PREFIX,
  questionsOf,
  validateAnswers,
  type AnswerValue,
  type ProjectDocumentKind,
  type FeasibilityStatus,
  type ProjectItemKind,
  type ProjectItemOrigin,
  type Question,
  type QuestionnaireDefinition,
  type RequiredDocument,
} from '@roshd/validation';
import type { ApiErrorDetail } from '@roshd/types';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../database/prisma.service';

/** The database, inside a transaction or outside of one. */
export type Db = PrismaService | Prisma.TransactionClient;

/** The stored content of an item a project has beside its template. */
export type ProjectItemContent =
  | { kind: 'QUESTION'; question: Question }
  | { kind: 'DOCUMENT'; document: RequiredDocument }
  | { kind: 'NOTE'; text: string };

export interface StoredProjectItem {
  id: string;
  kind: ProjectItemKind;
  key: string;
  origin: ProjectItemOrigin;
  addedById: string | null;
  createdAt: Date;
  content: ProjectItemContent;
}

export interface PinnedVersion {
  id: string;
  version: number;
  template: { id: string; title: string; isDemo: boolean };
  definition: QuestionnaireDefinition;
}

/** Everything the questionnaire of one project consists of. */
export interface ProjectQuestionnaire {
  status: FeasibilityStatus;
  sector: string | null;
  pinned: PinnedVersion | null;
  items: StoredProjectItem[];
  answers: { key: string; value: AnswerValue; updatedAt: Date }[];
  /** Which documents and file questions have a file that is still there, one entry per file. */
  files: { kind: ProjectDocumentKind; key: string; fileId: string }[];
}

/** Something of a project a file can be handed in for (ST-35.06). */
export interface DocumentSlot {
  kind: ProjectDocumentKind;
  key: string;
  label: string;
  help?: string;
  required: boolean;
  /** Where it comes from: the pinned template, or the project's own items with their origin. */
  origin: 'template' | ProjectItemOrigin;
  /** A file question takes several files; a document has versions instead. */
  maxFiles?: number;
}

/**
 * Everything a file can be handed in for, in the order of the form: the documents of the pinned
 * template, the documents the project has of its own, then the file questions.
 */
export function documentSlotsOf(
  questionnaire: Pick<ProjectQuestionnaire, 'pinned' | 'items'>,
): DocumentSlot[] {
  const question = (item: Question, origin: DocumentSlot['origin']): DocumentSlot[] =>
    item.type === 'file'
      ? [
          {
            kind: 'ANSWER',
            key: item.key,
            label: item.label,
            ...(item.help ? { help: item.help } : {}),
            required: item.required === true,
            origin,
            ...(item.maxFiles !== undefined ? { maxFiles: item.maxFiles } : {}),
          },
        ]
      : [];
  const document = (item: RequiredDocument, origin: DocumentSlot['origin']): DocumentSlot => ({
    kind: 'DOCUMENT',
    key: item.key,
    label: item.label,
    ...(item.help ? { help: item.help } : {}),
    required: item.required === true,
    origin,
  });
  const pinned = questionnaire.pinned?.definition;
  return [
    ...(pinned?.documents ?? []).map((item) => document(item, 'template')),
    ...questionnaire.items.flatMap((item) =>
      item.content.kind === 'DOCUMENT' ? [document(item.content.document, item.origin)] : [],
    ),
    ...(pinned ? questionsOf(pinned).flatMap((item) => question(item, 'template')) : []),
    ...questionnaire.items.flatMap((item) =>
      item.content.kind === 'QUESTION' ? question(item.content.question, item.origin) : [],
    ),
  ];
}

const KEY_ALPHABET = 'abcdefghjkmnpqrstvwxyz0123456789';

/** The key of a new item of a project; unique in the project by the database. */
export function generateItemKey(): string {
  let key = PROJECT_ITEM_KEY_PREFIX;
  for (let i = 0; i < 12; i++) key += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)];
  return key;
}

/** A definition as it was stored; it was checked when it was written. */
export const storedDefinition = (value: Prisma.JsonValue): QuestionnaireDefinition =>
  value as unknown as QuestionnaireDefinition;

/** Every question a project answers: those of its pinned version, then its own. */
export function questionsOfProject(
  questionnaire: Pick<ProjectQuestionnaire, 'pinned' | 'items'>,
): Question[] {
  return [
    ...(questionnaire.pinned ? questionsOf(questionnaire.pinned.definition) : []),
    ...questionnaire.items.flatMap((item) =>
      item.content.kind === 'QUESTION' ? [item.content.question] : [],
    ),
  ];
}

/** Required documents of the list without a file: one is handed in when it has a version. */
export function missingDocumentsOf(
  questionnaire: Pick<ProjectQuestionnaire, 'pinned' | 'items' | 'files'>,
): DocumentSlot[] {
  const handedIn = new Set(
    questionnaire.files.filter((file) => file.kind === 'DOCUMENT').map((file) => file.key),
  );
  return documentSlotsOf(questionnaire).filter(
    (slot) => slot.kind === 'DOCUMENT' && slot.required && !handedIn.has(slot.key),
  );
}

/** Under which path the API reports a problem of an answer. */
export const answerIssues = (issues: { path: string; message: string }[]): ApiErrorDetail[] =>
  issues.map((issue) => ({ path: `answers.${issue.path}`, message: issue.message }));

/**
 * Reads the questionnaire of a project (ST-35.03). It is shared by the questionnaire API and by
 * the submission of a project, which is why it knows nothing about who is asking.
 */
@Injectable()
export class QuestionnaireReader {
  async load(db: Db, projectId: string): Promise<ProjectQuestionnaire | null> {
    const project = await db.feasibilityProject.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        sector: true,
        templateVersion: {
          select: {
            id: true,
            version: true,
            definition: true,
            template: { select: { id: true, title: true, isDemo: true } },
          },
        },
        questionnaireItems: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            kind: true,
            key: true,
            definition: true,
            origin: true,
            addedById: true,
            createdAt: true,
          },
        },
        answers: {
          orderBy: { questionKey: 'asc' },
          select: { questionKey: true, value: true, updatedAt: true },
        },
        documents: {
          // A file staff deleted through the files module is not handed in any more.
          where: { file: { status: 'ACTIVE' } },
          orderBy: { version: 'asc' },
          select: { kind: true, slotKey: true, fileId: true },
        },
      },
    });
    if (!project) return null;
    const { templateVersion, questionnaireItems, answers, documents } = project;
    return {
      status: project.status,
      sector: project.sector,
      pinned: templateVersion
        ? { ...templateVersion, definition: storedDefinition(templateVersion.definition) }
        : null,
      items: questionnaireItems.map(({ definition, ...item }) => ({
        ...item,
        content: definition as unknown as ProjectItemContent,
      })),
      answers: answers.map((answer) => ({
        key: answer.questionKey,
        value: answer.value as unknown as AnswerValue,
        updatedAt: answer.updatedAt,
      })),
      files: documents.map((row) => ({ kind: row.kind, key: row.slotKey, fileId: row.fileId })),
    };
  }

  /**
   * The version a project of this sector starts with: the latest published one of the sector's
   * questionnaire, or of the general questionnaire when the sector has none.
   */
  async versionFor(db: Db, sector: string | null): Promise<{ id: string } | null> {
    const latest = (templateSector: string | null) =>
      db.questionnaireTemplateVersion.findFirst({
        where: { status: 'PUBLISHED', template: { archivedAt: null, sector: templateSector } },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
    return (sector ? await latest(sector) : null) ?? (await latest(null));
  }

  /**
   * What keeps the questionnaire of a project from being submitted: required questions without
   * an answer, answers that no longer satisfy their question, and required documents that were
   * not handed in. Empty when there is nothing to answer or to hand in.
   */
  async incomplete(db: Db, projectId: string): Promise<ApiErrorDetail[]> {
    const questionnaire = await this.load(db, projectId);
    if (!questionnaire) return [];
    const questions = questionsOfProject(questionnaire);
    const keys = new Set(questions.map((question) => question.key));
    const answers: Record<string, AnswerValue> = Object.fromEntries(
      questionnaire.answers
        .filter((answer) => keys.has(answer.key))
        .map((answer) => [answer.key, answer.value]),
    );
    // The answer of a file question is the files that are there now, whatever its row says.
    for (const question of questions) {
      if (question.type !== 'file') continue;
      const ids = questionnaire.files
        .filter((file) => file.kind === 'ANSWER' && file.key === question.key)
        .map((file) => file.fileId);
      if (ids.length > 0) answers[question.key] = ids;
      else delete answers[question.key];
    }
    const checked = validateAnswers(questions, answers, { complete: true });
    const documents = missingDocumentsOf(questionnaire).map((slot) => ({
      path: `documents.${slot.key}`,
      message: `مدرک الزامی «${slot.label}» بارگذاری نشده است.`,
    }));
    return [...(checked.ok ? [] : answerIssues(checked.issues)), ...documents];
  }
}
