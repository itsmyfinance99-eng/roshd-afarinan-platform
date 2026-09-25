import { Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createCourseSchema,
  createInstructorSchema,
  listCoursesAdminQuerySchema,
  updateCourseSchema,
  z,
  type CreateCourseInput,
  type CreateInstructorInput,
  type ListCoursesAdminQuery,
  type UpdateCourseInput,
} from '@roshd/validation';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { LearningService } from './learning.service';

const idParam = z.uuid();

/** Catalog management for courses and instructors (`catalog:manage`). */
@ApiTags('learning')
@RequirePermissions('catalog:manage')
@Controller('catalog')
export class LearningAdminController {
  constructor(private readonly learning: LearningService) {}

  @Get('courses')
  @ApiOperation({ summary: 'All courses incl. drafts' })
  list(@ZodQuery(listCoursesAdminQuerySchema) query: ListCoursesAdminQuery) {
    return this.learning.listForEditors(query);
  }

  @Get('courses/:id')
  get(@ZodParam('id', idParam) id: string) {
    return this.learning.getForEditors(id);
  }

  @Post('courses')
  @ApiOperation({ summary: 'Create a draft course' })
  create(
    @ZodBody(createCourseSchema) body: CreateCourseInput,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.learning.create(body, user, meta);
  }

  @Patch('courses/:id')
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(updateCourseSchema) body: UpdateCourseInput,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.learning.update(id, body, user, meta);
  }

  @Post('courses/:id/publish')
  @HttpCode(200)
  publish(
    @ZodParam('id', idParam) id: string,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.learning.publish(id, user, meta);
  }

  @Post('courses/:id/archive')
  @HttpCode(200)
  archive(
    @ZodParam('id', idParam) id: string,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.learning.archive(id, user, meta);
  }

  @Get('instructors')
  instructors() {
    return this.learning.listInstructors();
  }

  @Post('instructors')
  createInstructor(@ZodBody(createInstructorSchema) body: CreateInstructorInput) {
    return this.learning.createInstructor(body);
  }
}
