import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { listAuditLogsQuerySchema, type ListAuditLogsQuery } from '@roshd/validation';
import { ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { AuditLogService } from './audit-log.service';

@ApiTags('audit')
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  @RequirePermissions('audit:read')
  @ApiOperation({
    summary: 'Audit trail (admins): filter by action/prefix, actor email, entity, Iran-time days',
  })
  list(@ZodQuery(listAuditLogsQuerySchema) query: ListAuditLogsQuery) {
    return this.audit.list(query);
  }
}
