import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

/**
 * Read side of the audit trail. Separate from the global AuditModule (write side) because it
 * needs UsersService, which itself depends on AuditService.
 */
@Module({
  imports: [UsersModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
})
export class AuditLogModule {}
