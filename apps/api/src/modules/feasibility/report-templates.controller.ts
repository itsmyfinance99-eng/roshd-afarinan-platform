import { Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createReportTemplateSchema,
  idSchema,
  listReportTemplatesQuerySchema,
  updateReportTemplateSchema,
  type CreateReportTemplateInput,
  type ListReportTemplatesQuery,
  type UpdateReportTemplateInput,
} from '@roshd/validation';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { ReportTemplatesService } from './report-templates.service';

/**
 * Report templates (ST-35.12): the chapters of a feasibility report as the staff of the
 * platform arranged them. Only the staff read and write them here; an expert chooses one for
 * the report of a project from the names the draft of that report lists.
 */
@ApiTags('feasibility')
@Controller('report-templates')
@RequirePermissions('feasibility:manage')
export class ReportTemplatesController {
  constructor(private readonly templates: ReportTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Report templates; state=active (default), archived or all' })
  list(@ZodQuery(listReportTemplatesQuerySchema) query: ListReportTemplatesQuery) {
    return this.templates.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Write a report template (audited)' })
  create(
    @CurrentUser() user: Principal,
    @ZodBody(createReportTemplateSchema) body: CreateReportTemplateInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.templates.create(body, user, meta);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A report template with its chapters' })
  get(@ZodParam('id', idSchema) id: string) {
    return this.templates.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change the name or the chapters of a template, or archive it (audited)',
  })
  update(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(updateReportTemplateSchema) body: UpdateReportTemplateInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.templates.update(id, body, user, meta);
  }
}
