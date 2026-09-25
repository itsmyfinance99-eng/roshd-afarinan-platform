/**
 * Port for online payment providers (Iranian PSPs). Business logic depends only on this
 * interface; the concrete provider is chosen by configuration (ADR-0004, OQ-09).
 *
 * Amounts are integer Rials as `bigint` — never floating point.
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface InitiatePaymentRequest {
  /** Our PaymentAttempt id; also used as the provider-side order id. */
  attemptId: string;
  amountRials: bigint;
  /** Absolute URL the provider redirects the payer back to. */
  callbackUrl: string;
  description: string;
  /** Same key → same result; protects against double initiation. */
  idempotencyKey: string;
  payer?: { mobile?: string; email?: string };
}

export interface InitiatePaymentResult {
  providerReference: string;
  redirectUrl: string;
}

export interface VerifyPaymentRequest {
  attemptId: string;
  providerReference: string;
  /** The amount we expect; a provider-reported mismatch must fail verification. */
  amountRials: bigint;
  /** Raw query/body parameters the provider sent to the callback URL. */
  callbackParams: Record<string, string>;
}

export type VerifyPaymentResult =
  | { status: 'VERIFIED'; providerReference: string; trackingCode: string; cardMask?: string }
  | { status: 'FAILED'; providerReference: string; reason: string };

export interface PaymentGateway {
  readonly provider: string;
  /** True for simulators; production boot refuses them. */
  readonly isTestProvider: boolean;
  initiate(request: InitiatePaymentRequest): Promise<InitiatePaymentResult>;
  /**
   * Server-to-server verification. The ONLY source of truth for a successful payment:
   * a user returning from the gateway never marks an order paid by itself.
   * Must be safe to call more than once for the same reference.
   */
  verify(request: VerifyPaymentRequest): Promise<VerifyPaymentResult>;
}
