import { createHash } from 'node:crypto';
import {
  type IranSahamdarClient,
  type ListingReceipt,
  ListingNotFoundError,
  type ProjectListingDraft,
} from '../ports/iran-sahamdar-client';

/**
 * In-memory simulator of the Iran Sahamdar boundary. It sends no network traffic.
 * Behaviour: submissions are idempotent by key; status moves SUBMITTED → UNDER_REVIEW on first read.
 */
export class MockIranSahamdarClient implements IranSahamdarClient {
  readonly mode = 'mock' as const;
  private readonly listings = new Map<string, ListingReceipt>();

  healthCheck(): Promise<void> {
    return Promise.resolve();
  }

  submitListing(draft: ProjectListingDraft): Promise<ListingReceipt> {
    if (!draft.title.trim()) return Promise.reject(new Error('title is required'));
    const externalReference = `MOCK-IS-${createHash('sha256')
      .update(draft.idempotencyKey)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase()}`;
    const existing = this.listings.get(externalReference);
    if (existing) return Promise.resolve({ ...existing });

    const receipt: ListingReceipt = {
      externalReference,
      status: 'SUBMITTED',
      receivedAt: new Date(),
    };
    this.listings.set(externalReference, receipt);
    return Promise.resolve({ ...receipt });
  }

  getListingStatus(externalReference: string): Promise<ListingReceipt> {
    const receipt = this.listings.get(externalReference);
    if (!receipt) return Promise.reject(new ListingNotFoundError(externalReference));
    if (receipt.status === 'SUBMITTED') receipt.status = 'UNDER_REVIEW';
    return Promise.resolve({ ...receipt });
  }

  withdrawListing(externalReference: string): Promise<ListingReceipt> {
    const receipt = this.listings.get(externalReference);
    if (!receipt) return Promise.reject(new ListingNotFoundError(externalReference));
    receipt.status = 'WITHDRAWN';
    return Promise.resolve({ ...receipt });
  }
}
