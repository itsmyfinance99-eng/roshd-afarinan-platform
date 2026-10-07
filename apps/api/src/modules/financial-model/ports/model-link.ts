import type { Principal } from '../../rbac/principal';

/** What a caller is to a model that belongs to something else (a feasibility project). */
export interface LinkedModelAccess {
  /** The feasibility project the model belongs to. */
  projectId: string;
  /** An expert working on that project. */
  expert: boolean;
  /** Staff of that project. */
  manager: boolean;
  /** The project is closed: the model and its runs are read, and nothing is changed. */
  frozen: boolean;
}

/**
 * Who reaches a model that is not a personal one (ADR-0010 §6). The module that owns the link
 * answers; this module never reads the other module's tables.
 */
export interface ModelLinkSource {
  /**
   * `null` for a model that is not linked. For a linked model the answer is the whole access:
   * the owner and the assignee of the model row count for nothing there.
   */
  accessOf(modelId: string, principal: Principal): Promise<LinkedModelAccess | null>;
  /** Which of these models are linked. */
  linkedAmong(modelIds: string[]): Promise<Set<string>>;
}

/** Until a module registers its links, every model is a personal one. */
export const NO_MODEL_LINKS: ModelLinkSource = {
  accessOf: () => Promise.resolve(null),
  linkedAmong: () => Promise.resolve(new Set()),
};
