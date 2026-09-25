import { describe, expect, it } from 'vitest';
import { MockPaymentGateway } from './mock-payment-gateway';

const request = {
  attemptId: 'attempt-1',
  amountRials: 12_500_000n,
  callbackUrl: 'https://roshd.example/api/v1/payments/callback',
  description: 'خرید دوره',
  idempotencyKey: 'order-1:attempt-1',
};

describe('MockPaymentGateway (PaymentGateway contract)', () => {
  it('is flagged as a test provider', () => {
    expect(new MockPaymentGateway().isTestProvider).toBe(true);
  });

  it('is idempotent on initiate', async () => {
    const gateway = new MockPaymentGateway();
    const a = await gateway.initiate(request);
    const b = await gateway.initiate(request);
    expect(b).toEqual(a);
    expect(a.redirectUrl).toContain(a.providerReference);
  });

  it('rejects non-positive amounts', async () => {
    await expect(
      new MockPaymentGateway().initiate({ ...request, amountRials: 0n }),
    ).rejects.toThrow();
  });

  it('verifies only a matching reference, attempt and amount', async () => {
    const gateway = new MockPaymentGateway();
    const { providerReference } = await gateway.initiate(request);
    const base = { attemptId: 'attempt-1', providerReference, amountRials: 12_500_000n };

    await expect(
      gateway.verify({ ...base, callbackParams: { status: 'OK' } }),
    ).resolves.toMatchObject({ status: 'VERIFIED', providerReference });
    await expect(
      gateway.verify({ ...base, amountRials: 1n, callbackParams: { status: 'OK' } }),
    ).resolves.toMatchObject({ status: 'FAILED', reason: 'amount_mismatch' });
    await expect(
      gateway.verify({ ...base, attemptId: 'other', callbackParams: { status: 'OK' } }),
    ).resolves.toMatchObject({ status: 'FAILED', reason: 'attempt_mismatch' });
    await expect(
      gateway.verify({ ...base, callbackParams: { status: 'NOK' } }),
    ).resolves.toMatchObject({ status: 'FAILED', reason: 'payer_cancelled' });
    await expect(
      gateway.verify({
        ...base,
        providerReference: 'MOCK-UNKNOWN',
        callbackParams: { status: 'OK' },
      }),
    ).resolves.toMatchObject({ status: 'FAILED', reason: 'unknown_reference' });
  });

  it('verification is repeatable (safe to call twice)', async () => {
    const gateway = new MockPaymentGateway();
    const { providerReference } = await gateway.initiate(request);
    const verify = () =>
      gateway.verify({
        attemptId: 'attempt-1',
        providerReference,
        amountRials: 12_500_000n,
        callbackParams: { status: 'OK' },
      });
    expect(await verify()).toEqual(await verify());
  });
});
