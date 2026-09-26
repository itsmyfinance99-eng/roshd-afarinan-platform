import { Module } from '@nestjs/common';
import { LearningModule } from '../learning/learning.module';
import { UsersModule } from '../users/users.module';
import { OrdersController, PaymentsController } from './orders.controllers';
import { OrdersService } from './orders.service';

/** Orders and payment attempts; the PaymentGateway port comes from the global PaymentsModule. */
@Module({
  imports: [LearningModule, UsersModule],
  controllers: [OrdersController, PaymentsController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
