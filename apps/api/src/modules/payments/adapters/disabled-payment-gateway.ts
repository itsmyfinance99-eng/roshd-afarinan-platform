import { ServiceUnavailableError } from '../../../common/errors/app-exception';
import type { PaymentGateway } from '../ports/payment-gateway';

/** Used until a real PSP is configured (OQ-09): online payment is unavailable, nothing is faked. */
export class DisabledPaymentGateway implements PaymentGateway {
  readonly provider = 'disabled';
  readonly isTestProvider = false;

  initiate(): Promise<never> {
    return Promise.reject(new ServiceUnavailableError('پرداخت آنلاین در حال حاضر فعال نیست.'));
  }

  verify(): Promise<never> {
    return Promise.reject(new ServiceUnavailableError('پرداخت آنلاین در حال حاضر فعال نیست.'));
  }
}
