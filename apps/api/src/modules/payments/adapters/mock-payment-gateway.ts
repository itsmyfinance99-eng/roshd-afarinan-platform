import { createHash } from 'node:crypto';
import type {
  InitiatePaymentRequest,
  InitiatePaymentResult,
  PaymentGateway,
  VerifyPaymentRequest,
  VerifyPaymentResult,
} from '../ports/payment-gateway';

/**
 * Deterministic in-memory payment simulator for development and tests.
 * The callback decides the outcome with `status=OK` (success) or anything else (failure).
 * Never usable in production (config refuses PAYMENT_PROVIDER=mock there).
 */
export class MockPaymentGateway implements PaymentGateway {
  readonly provider = 'mock';
  readonly isTestProvider = true;
  private readonly initiated = new Map<string, { attemptId: string; amountRials: bigint }>();
  private readonly byIdempotencyKey = new Map<string, InitiatePaymentResult>();

  constructor(private readonly baseUrl = 'https://mock-gateway.invalid/pay') {}

  initiate(request: InitiatePaymentRequest): Promise<InitiatePaymentResult> {
    if (request.amountRials <= 0n) return Promise.reject(new Error('Amount must be positive'));
    const existing = this.byIdempotencyKey.get(request.idempotencyKey);
    if (existing) return Promise.resolve(existing);

    const providerReference = `MOCK-${createHash('sha256')
      .update(request.idempotencyKey)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase()}`;
    const result = {
      providerReference,
      redirectUrl: `${this.baseUrl}/${providerReference}?callback=${encodeURIComponent(request.callbackUrl)}`,
    };
    this.initiated.set(providerReference, {
      attemptId: request.attemptId,
      amountRials: request.amountRials,
    });
    this.byIdempotencyKey.set(request.idempotencyKey, result);
    return Promise.resolve(result);
  }

  verify(request: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    const known = this.initiated.get(request.providerReference);
    const fail = (reason: string): Promise<VerifyPaymentResult> =>
      Promise.resolve({ status: 'FAILED', providerReference: request.providerReference, reason });

    if (!known) return fail('unknown_reference');
    if (known.attemptId !== request.attemptId) return fail('attempt_mismatch');
    if (known.amountRials !== request.amountRials) return fail('amount_mismatch');
    if (request.callbackParams.status !== 'OK') return fail('payer_cancelled');

    return Promise.resolve({
      status: 'VERIFIED',
      providerReference: request.providerReference,
      trackingCode: `TRK-${request.providerReference.slice(5, 13)}`,
      cardMask: '6037-99**-****-1234',
    });
  }
}
