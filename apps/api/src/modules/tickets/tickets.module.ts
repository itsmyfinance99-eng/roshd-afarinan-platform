import { Module } from '@nestjs/common';
import { ServiceRequestsModule } from '../service-requests/service-requests.module';
import { UsersModule } from '../users/users.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [ServiceRequestsModule, UsersModule],
  exports: [TicketsService],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
