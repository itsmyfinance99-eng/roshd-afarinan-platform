import { Controller, Delete, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createQuestionnaireTemplateSchema,
  idSchema,
  listQuestionnaireTemplatesQuerySchema,
  questionnaireVersionNumberSchema,
  saveQuestionnaireDraftSchema,
  updateQuestionnaireTemplateSchema,
  type CreateQuestionnaireTemplateInput,
  type ListQuestionnaireTemplatesQuery,
  type SaveQuestionnaireDraftInput,
  type UpdateQuestionnaireTemplateInput,
} from '@roshd/validation';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { QuestionnaireTemplatesService } from './questionnaire-templates.service';

/**
 * Questionnaire templates (ST-35.03): written and published by the staff of the feasibility
 * platform. An applicant never reads a template here; they get the version their project is
 * pinned to through the project.
 */
@ApiTags('feasibility')
@Controller('questionnaire-templates')
@RequirePermissions('feasibility:manage')
export class QuestionnaireTemplatesController {
  constructor(private readonly templates: QuestionnaireTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Questionnaire templates; state=active (default), archived or all' })
  list(@ZodQuery(listQuestionnaireTemplatesQuerySchema) query: ListQuestionnaireTemplatesQuery) {
    return this.templates.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Start a template with the draft of its first version (audited)' })
  create(
    @CurrentUser() user: Principal,
    @ZodBody(createQuestionnaireTemplateSchema) body: CreateQuestionnaireTemplateInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.templates.create(body, user, meta);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A template with its versions, its draft and its published content' })
  get(@ZodParam('id', idSchema) id: string) {
    return this.templates.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change the title or sector of a template, or archive it (audited)' })
  update(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(updateQuestionnaireTemplateSchema) body: UpdateQuestionnaireTemplateInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.templates.update(id, body, user, meta);
  }

  @Get(':id/versions/:version')
  @ApiOperation({ summary: 'The content of one version of a template' })
  getVersion(
    @ZodParam('id', idSchema) id: string,
    @ZodParam('version', questionnaireVersionNumberSchema) version: number,
  ) {
    return this.templates.getVersion(id, version);
  }

  @Put(':id/draft')
  @ApiOperation({
    summary: 'Save the draft; after a publication the first save starts the next version',
  })
  saveDraft(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(saveQuestionnaireDraftSchema) body: SaveQuestionnaireDraftInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.templates.saveDraft(id, body, user, meta);
  }

  @Delete(':id/draft')
  @HttpCode(200)
  @ApiOperation({ summary: 'Drop the draft and keep the published version (audited)' })
  discardDraft(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.templates.discardDraft(id, user, meta);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Publish the draft: new projects start with it, and it never changes again (audited)',
  })
  publish(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.templates.publish(id, user, meta);
  }
}
