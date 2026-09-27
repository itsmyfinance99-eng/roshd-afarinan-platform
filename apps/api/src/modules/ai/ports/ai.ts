/**
 * AI foundation contracts (EPIC-18, Phase 7). Interfaces only; no provider is wired yet (OQ-14).
 *
 * Rules encoded in the types:
 * - Retrieval REQUIRES the caller's principal: authorization happens before retrieval.
 * - Every AI output carries model/version and source references and starts as advisory
 *   (`reviewStatus: 'PENDING_REVIEW'`) until an expert approves it.
 */
import type { Permission, Role } from '@roshd/types';

export const AI_PROVIDER = Symbol('AI_PROVIDER');
export const RETRIEVAL_PROVIDER = Symbol('RETRIEVAL_PROVIDER');

export interface AiPrincipal {
  userId: string;
  roles: readonly Role[];
  permissions: ReadonlySet<Permission>;
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  messages: AiMessage[];
  /** Versioned prompt template id, e.g. `feasibility.missing-data@3`. */
  promptTemplate: string;
  maxOutputTokens: number;
  /** Retrieved context, already authorised for the principal. Treated as untrusted data. */
  context?: RetrievedChunk[];
}

export interface AiCompletion {
  content: string;
  model: string;
  modelVersion: string;
  inputTokens: number;
  outputTokens: number;
  sources: SourceReference[];
  reviewStatus: 'PENDING_REVIEW';
}

export interface AiProvider {
  readonly provider: string;
  complete(request: AiCompletionRequest): Promise<AiCompletion>;
}

export interface SourceReference {
  documentId: string;
  version: number;
  excerpt?: string;
}

export interface RetrievedChunk extends SourceReference {
  content: string;
  score: number;
}

export interface RetrievalProvider {
  /** Implementations MUST filter by what `principal` may access BEFORE ranking. */
  retrieve(
    principal: AiPrincipal,
    query: { text: string; projectId?: string; limit: number },
  ): Promise<RetrievedChunk[]>;
}
