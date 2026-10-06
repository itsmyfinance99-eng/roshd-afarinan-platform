import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  PROJECT_ITEM_KEY_PREFIX,
  questionsOf,
  validateAnswers,
  type AnswerValue,
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
      },
    });
    if (!project) return null;
    const { templateVersion, questionnaireItems, answers } = project;
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
   * an answer, and answers that no longer satisfy their question. Empty when there is nothing to
   * answer.
   */
  async incomplete(db: Db, projectId: string): Promise<ApiErrorDetail[]> {
    const questionnaire = await this.load(db, projectId);
    if (!questionnaire) return [];
    const questions = questionsOfProject(questionnaire);
    if (questions.length === 0) return [];
    const keys = new Set(questions.map((question) => question.key));
    const answers = Object.fromEntries(
      questionnaire.answers
        .filter((answer) => keys.has(answer.key))
        .map((answer) => [answer.key, answer.value]),
    );
    const checked = validateAnswers(questions, answers, { complete: true });
    return checked.ok ? [] : answerIssues(checked.issues);
  }
}
