import { describe, expect, it } from 'vitest';
import { MockIranSahamdarClient } from './adapters/mock-iran-sahamdar-client';
import { type IranSahamdarClient, ListingNotFoundError } from './ports/iran-sahamdar-client';

/**
 * Contract tests for IranSahamdarClient. Any future live adapter must pass the same suite
 * (run against the provider sandbox) before it may replace the mock.
 */
function contract(name: string, make: () => IranSahamdarClient) {
  describe(`IranSahamdarClient contract: ${name}`, () => {
    const draft = {
      internalProjectId: 'opp-1',
      title: 'طرح نمونه',
      sector: 'mining',
      province: 'یزد',
      summary: 'نمونه نمایشی',
      idempotencyKey: 'opp-1:v1',
    };

    it('submits idempotently', async () => {
      const client = make();
      const a = await client.submitListing(draft);
      const b = await client.submitListing(draft);
      expect(b.externalReference).toBe(a.externalReference);
      expect(a.status).toBe('SUBMITTED');
    });

    it('reports status and supports withdrawal', async () => {
      const client = make();
      const { externalReference } = await client.submitListing(draft);
      expect((await client.getListingStatus(externalReference)).status).not.toBe('WITHDRAWN');
      expect((await client.withdrawListing(externalReference)).status).toBe('WITHDRAWN');
    });

    it('fails clearly for unknown references', async () => {
      await expect(make().getListingStatus('nope')).rejects.toBeInstanceOf(ListingNotFoundError);
    });

    it('is healthy', async () => {
      await expect(make().healthCheck()).resolves.toBeUndefined();
    });
  });
}

contract('mock', () => new MockIranSahamdarClient());

describe('MockIranSahamdarClient', () => {
  it('declares mock mode', () => {
    expect(new MockIranSahamdarClient().mode).toBe('mock');
  });
});
