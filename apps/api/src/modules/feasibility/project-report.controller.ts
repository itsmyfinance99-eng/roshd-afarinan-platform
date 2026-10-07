import { Controller, Get, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  FEASIBILITY_REPORT_CHAPTERS,
  idSchema,
  issueReportVersionSchema,
  reportTemplateChoiceSchema,
  reportVersionNumberSchema,
  reportViewQuerySchema,
  saveReportChapterSchema,
  selectReportRunSchema,
  z,
  type FeasibilityReportChapterKey,
  type IssueReportVersionInput,
  type ReportTemplateChoiceInput,
  type ReportViewQuery,
  type SaveReportChapterInput,
  type SelectReportRunInput,
} from '@roshd/validation';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { CurrentUser, type Principal } from '../rbac/principal';
import { ProjectReportService } from './project-report.service';

const chapterKeySchema = z.enum(FEASIBILITY_REPORT_CHAPTERS);

/**
 * The report of a feasibility study (ST-35.12). Every route needs a signed-in user. The draft
 * is for the staff and the assigned experts of the project (its applicant gets 403); the
 * versions are also read by the applicant, who gets the newest one once the study is with them.
 * For everybody else the project does not exist (404).
 */
@ApiTags('feasibility')
@Controller('feasibility-projects/:id/report')
export class ProjectReportController {
  constructor(private readonly report: ProjectReportService) {}

  @Get()
  @ApiOperation({
    summary:
      'The draft of the report with the approved runs and the questions it can use (staff and assigned experts)',
  })
  get(@CurrentUser() user: Principal, @ZodParam('id', idSchema) id: string) {
    return this.report.get(id, user);
  }

  @Post()
  @ApiOperation({
    summary:
      'Start the report with the chapters of a template or the standard structure (once, while the work lasts; audited)',
  })
  start(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(reportTemplateChoiceSchema) body: ReportTemplateChoiceInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.report.start(id, body, user, meta);
  }

  @Put('template')
  @ApiOperation({
    summary: 'Give the draft the chapters of another template; written chapters keep their text',
  })
  applyTemplate(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(reportTemplateChoiceSchema) body: ReportTemplateChoiceInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.report.applyTemplate(id, body, user, meta);
  }

  @Put('chapters/:key')
  @ApiOperation({
    summary:
      'Save the text and the quoted answers of a chapter; refused on top of an older version (409)',
  })
  saveChapter(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('key', chapterKeySchema) key: FeasibilityReportChapterKey,
    @ZodBody(saveReportChapterSchema) body: SaveReportChapterInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.report.saveChapter(id, key, body, user, meta);
  }

  @Put('run')
  @ApiOperation({
    summary: 'Choose the approved calculation run of the project the report takes its figures from',
  })
  selectRun(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(selectReportRunSchema) body: SelectReportRunInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.report.selectRun(id, body, user, meta);
  }

  @Get('preview')
  @ApiOperation({
    summary: 'The draft as it would be issued now, with what is still missing (nothing is stored)',
  })
  preview(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodQuery(reportViewQuerySchema) query: ReportViewQuery,
  ) {
    return this.report.preview(id, user, query);
  }

  @Get('versions')
  @ApiOperation({
    summary: 'The issued versions, newest first (the applicant: the newest, once it is with them)',
  })
  versions(@CurrentUser() user: Principal, @ZodParam('id', idSchema) id: string) {
    return this.report.versions(id, user);
  }

  @Post('versions')
  @ApiOperation({
    summary: 'Issue the draft as the next version, which never changes (audited)',
  })
  issue(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(issueReportVersionSchema) body: IssueReportVersionInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.report.issue(id, body, user, meta);
  }

  @Get('versions/:number')
  @ApiOperation({
    summary: 'A version with its chapters and the schedules of its calculation run',
  })
  version(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('number', reportVersionNumberSchema) number: number,
    @ZodQuery(reportViewQuerySchema) query: ReportViewQuery,
  ) {
    return this.report.version(id, number, user, query);
  }
}
