import type { QuestionnaireDefinition } from '@roshd/validation';
import type { StaffRef } from '@/components/dashboard/types';

/** Mirrors the list items of GET /api/v1/questionnaire-templates. */
export interface QuestionnaireTemplateItem {
  id: string;
  title: string;
  /** `null` for the general questionnaire of every sector. */
  sector: string | null;
  isDemo: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  published: { version: number; publishedAt: string | null } | null;
  draft: { version: number; updatedAt: string } | null;
}

export interface QuestionnaireVersionItem {
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  updatedAt: string;
  publishedAt: string | null;
  publishedBy: StaffRef | null;
}

/** Mirrors GET /api/v1/questionnaire-templates/:id. */
export interface QuestionnaireTemplateDetail extends QuestionnaireTemplateItem {
  versions: QuestionnaireVersionItem[];
  draftDefinition: QuestionnaireDefinition | null;
  publishedDefinition: QuestionnaireDefinition | null;
}

/** Mirrors GET /api/v1/questionnaire-templates/:id/versions/:version. */
export interface QuestionnaireVersionDetail extends QuestionnaireVersionItem {
  definition: QuestionnaireDefinition;
}
