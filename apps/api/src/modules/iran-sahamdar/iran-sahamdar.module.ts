import { Global, Module } from '@nestjs/common';
import { MockIranSahamdarClient } from './adapters/mock-iran-sahamdar-client';
import { IRAN_SAHAMDAR_CLIENT } from './ports/iran-sahamdar-client';

/** Only the mock exists until the real specification is supplied (OQ-06). */
@Global()
@Module({
  providers: [{ provide: IRAN_SAHAMDAR_CLIENT, useFactory: () => new MockIranSahamdarClient() }],
  exports: [IRAN_SAHAMDAR_CLIENT],
})
export class IranSahamdarModule {}
