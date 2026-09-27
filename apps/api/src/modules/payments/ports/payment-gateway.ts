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

/**
 * Ceiling for one gateway call, chosen to stay well inside `REQUEST_TIMEOUT_MS`. Part of the
 * contract so the adapter written for a real PSP (ST-07.03) cannot leave it open (ST-26.10,
 * finding I-08): a gateway that holds the connection would otherwise pin a request and its
 * database connection for as long as the PSP likes.
 */
export const PAYMENT_GATEWAY_TIMEOUT_MS = 15_000;

export interface PaymentGateway {
  readonly provider: string;
  /** True for simulators; production boot refuses them. */
  readonly isTestProvider: boolean;
  /** Must settle within `PAYMENT_GATEWAY_TIMEOUT_MS`; a timeout fails the attempt (nothing was paid yet). */
  initiate(request: InitiatePaymentRequest): Promise<InitiatePaymentResult>;
  /**
   * Server-to-server verification. The ONLY source of truth for a successful payment:
   * a user returning from the gateway never marks an order paid by itself.
   * Must be safe to call more than once for the same reference, and must settle within
   * `PAYMENT_GATEWAY_TIMEOUT_MS`. A timeout is NOT a failed payment: the attempt stays
   * INITIATED so the next callback or a reconciliation run can verify it again.
   */
  verify(request: VerifyPaymentRequest): Promise<VerifyPaymentResult>;
}
