import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { DisabledPaymentGateway } from './adapters/disabled-payment-gateway';
import { MockPaymentGateway } from './adapters/mock-payment-gateway';
import { PAYMENT_GATEWAY, type PaymentGateway } from './ports/payment-gateway';

/**
 * Provides the configured PaymentGateway to the orders module. Real PSP adapters are added once
 * OQ-09 (provider choice) is decided.
 */
@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): PaymentGateway => {
        switch (config.PAYMENT_PROVIDER) {
          case 'mock':
            // The simulator's "gateway" is a dev page of the web app (/mock-gateway).
            return new MockPaymentGateway(`${config.WEB_BASE_URL}/mock-gateway`);
          case 'disabled':
            return new DisabledPaymentGateway();
        }
      },
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}
