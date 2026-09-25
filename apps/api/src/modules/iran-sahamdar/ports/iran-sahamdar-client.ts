/**
 * Integration boundary for Iran Sahamdar (EPIC-17, Phase 6).
 *
 * IMPORTANT: the real Iran Sahamdar API specification has NOT been provided (OQ-06).
 * These operations and DTOs describe what OUR platform needs, in our own domain terms.
 * They are not a guess of the external API. When the specification arrives, a real adapter
 * maps these DTOs to the external contract (see docs/integrations/iran-sahamdar.md).
 */
export const IRAN_SAHAMDAR_CLIENT = Symbol('IRAN_SAHAMDAR_CLIENT');

/** Version of this internal contract; bump on breaking changes to the DTOs below. */
export const IRAN_SAHAMDAR_CONTRACT_VERSION = '0.1.0-draft';

export interface ProjectListingDraft {
  /** Our InvestmentOpportunity id. */
  internalProjectId: string;
  title: string;
  sector: string;
  province: string;
  summary: string;
  /** Integer Rials; optional until real figures are approved. */
  requiredCapitalRials?: bigint;
  /** Idempotency key: resubmitting the same key must not create a duplicate listing. */
  idempotencyKey: string;
}

export type ListingStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'LISTED' | 'REJECTED' | 'WITHDRAWN';

export interface ListingReceipt {
  externalReference: string;
  status: ListingStatus;
  receivedAt: Date;
}

export interface IranSahamdarClient {
  readonly mode: 'mock' | 'live';
  healthCheck(): Promise<void>;
  submitListing(draft: ProjectListingDraft): Promise<ListingReceipt>;
  getListingStatus(externalReference: string): Promise<ListingReceipt>;
  withdrawListing(externalReference: string): Promise<ListingReceipt>;
}

export class ListingNotFoundError extends Error {
  constructor(reference: string) {
    super(`Listing not found: ${reference}`);
    this.name = 'ListingNotFoundError';
  }
}
