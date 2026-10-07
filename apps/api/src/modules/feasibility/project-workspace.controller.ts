import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createInternalNoteSchema,
  idSchema,
  listInternalNotesQuerySchema,
  type CreateInternalNoteInput,
  type ListInternalNotesQuery,
} from '@roshd/validation';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { CurrentUser, type Principal } from '../rbac/principal';
import { ProjectWorkspaceService } from './project-workspace.service';

/**
 * The workspace of a feasibility project (ST-35.10): its financial model and its internal
 * notes. Every route needs a signed-in user; the service checks that the caller is staff or an
 * assigned expert of the project. Its applicant gets 403, and for everybody else the project
 * does not exist (404).
 */
@ApiTags('feasibility')
@Controller('feasibility-projects/:id')
export class ProjectWorkspaceController {
  constructor(private readonly workspace: ProjectWorkspaceService) {}

  @Post('financial-model')
  @ApiOperation({
    summary:
      'Make the financial model of the study (staff or an assigned expert; once, while the work lasts; audited)',
  })
  createModel(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.workspace.createModel(id, user, meta);
  }

  @Get('notes')
  @ApiOperation({
    summary: 'The internal notes of the project, newest first (staff and assigned experts)',
  })
  listNotes(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodQuery(listInternalNotesQuerySchema) query: ListInternalNotesQuery,
  ) {
    return this.workspace.listNotes(id, user, query);
  }

  @Post('notes')
  @ApiOperation({
    summary: 'Write an internal note (staff and assigned experts; the applicant never reads it)',
  })
  addNote(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(createInternalNoteSchema) body: CreateInternalNoteInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.workspace.addNote(id, body, user, meta);
  }
}
