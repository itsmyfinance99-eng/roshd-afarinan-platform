import { Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addProjectQuestionnaireItemSchema,
  idSchema,
  saveQuestionnaireAnswersSchema,
  type AddProjectQuestionnaireItemInput,
  type SaveQuestionnaireAnswersInput,
} from '@roshd/validation';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam } from '../../common/http/zod';
import { CurrentUser, type Principal } from '../rbac/principal';
import { ProjectQuestionnaireService } from './project-questionnaire.service';

/**
 * The questionnaire of a feasibility project (ST-35.03). Every route needs a signed-in user; the
 * service checks the caller's relation to the project, and a project the caller has no relation
 * to does not exist (404).
 */
@ApiTags('feasibility')
@Controller('feasibility-projects/:id/questionnaire')
export class ProjectQuestionnaireController {
  constructor(private readonly questionnaire: ProjectQuestionnaireService) {}

  @Get()
  @ApiOperation({
    summary: 'The pinned version, the items of the project and its answers (who sees the project)',
  })
  get(@CurrentUser() user: Principal, @ZodParam('id', idSchema) id: string) {
    return this.questionnaire.get(id, user);
  }

  @Post('start')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Pin the project to the latest published version for its sector (its applicant)',
  })
  start(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.questionnaire.start(id, user, meta);
  }

  @Put('answers')
  @ApiOperation({
    summary: 'Save some answers (the applicant; draft or more information asked, else 409)',
  })
  saveAnswers(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(saveQuestionnaireAnswersSchema) body: SaveQuestionnaireAnswersInput,
  ) {
    return this.questionnaire.saveAnswers(id, body, user);
  }

  @Post('items')
  @ApiOperation({
    summary: 'Add a question, a document or a note of this project only (applicant or staff)',
  })
  addItem(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(addProjectQuestionnaireItemSchema) body: AddProjectQuestionnaireItemInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.questionnaire.addItem(id, body, user, meta);
  }

  @Delete('items/:itemId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Take out an item the caller’s side added, with its answer' })
  removeItem(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('itemId', idSchema) itemId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.questionnaire.removeItem(id, itemId, user, meta);
  }
}
