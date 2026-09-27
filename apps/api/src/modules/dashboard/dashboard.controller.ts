import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type Principal } from '../rbac/principal';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Live counts for the staff dashboard; each section only with its permission',
  })
  stats(@CurrentUser() user: Principal) {
    return this.dashboard.stats(user);
  }
}
