import { Module } from '@nestjs/common';
import { InvestmentAdminController, PublicInvestmentController } from './investment.controllers';
import { InvestmentService } from './investment.service';

@Module({
  controllers: [PublicInvestmentController, InvestmentAdminController],
  providers: [InvestmentService],
  exports: [InvestmentService],
})
export class InvestmentModule {}
