import { Controller, Get, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createReviewReplySchema,
  createReviewThreadSchema,
  idSchema,
  listReviewThreadsQuerySchema,
  setReviewThreadHandledSchema,
  type CreateReviewReplyInput,
  type CreateReviewThreadInput,
  type ListReviewThreadsQuery,
  type SetReviewThreadHandledInput,
} from '@roshd/validation';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { CurrentUser, type Principal } from '../rbac/principal';
import { ProjectReviewService } from './project-review.service';

/**
 * The comments of the review of a feasibility study (ST-35.11). Every route needs a signed-in
 * user; the service checks that the caller is the applicant, staff or an assigned expert of the
 * project (404 otherwise) and gives the applicant the shared threads only.
 */
@ApiTags('feasibility')
@Controller('feasibility-projects/:id/review-threads')
export class ProjectReviewController {
  constructor(private readonly review: ProjectReviewService) {}

  @Get()
  @ApiOperation({
    summary:
      'The review threads of the project with their comments, newest first (the applicant: shared threads only)',
  })
  list(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodQuery(listReviewThreadsQuerySchema) query: ListReviewThreadsQuery,
  ) {
    return this.review.list(id, user, query);
  }

  @Post()
  @ApiOperation({
    summary:
      'Start a thread on a part of the study (the applicant in CLIENT_REVIEW; staff and experts while the study is worked on)',
  })
  start(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(createReviewThreadSchema) body: CreateReviewThreadInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.review.start(id, body, user, meta);
  }

  @Post(':threadId/comments')
  @ApiOperation({ summary: 'Answer in a thread (every party that reads it)' })
  reply(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('threadId', idSchema) threadId: string,
    @ZodBody(createReviewReplySchema) body: CreateReviewReplyInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.review.reply(id, threadId, body, user, meta);
  }

  @Put(':threadId/handled')
  @ApiOperation({
    summary:
      'Mark a thread handled or open it again (staff and experts; the applicant reopens a thread of their own)',
  })
  setHandled(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('threadId', idSchema) threadId: string,
    @ZodBody(setReviewThreadHandledSchema) body: SetReviewThreadHandledInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.review.setHandled(id, threadId, body, user, meta);
  }
}
