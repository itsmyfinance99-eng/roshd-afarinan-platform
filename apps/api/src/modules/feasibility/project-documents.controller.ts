import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  idSchema,
  MAX_FILE_BYTES,
  projectDocumentSlotSchema,
  type ProjectDocumentSlotInput,
} from '@roshd/validation';
import { memoryStorage } from 'multer';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodParam, ZodValidationPipe } from '../../common/http/zod';
import type { UploadedFile as UploadedFileData } from '../files/files.service';
import { CurrentUser, type Principal } from '../rbac/principal';
import { ProjectDocumentsService } from './project-documents.service';

/**
 * The documents of a feasibility project (ST-35.06). Every route needs a signed-in user; the
 * service checks the caller's relation to the project, and a project the caller has no relation
 * to does not exist (404). The bytes of a file are only ever served through a signed URL.
 */
@ApiTags('feasibility')
@Controller('feasibility-projects/:id/documents')
export class ProjectDocumentsController {
  constructor(private readonly documents: ProjectDocumentsService) {}

  @Get()
  @ApiOperation({
    summary: 'What can be handed in for the project and the files there are (who sees the project)',
  })
  list(@CurrentUser() user: Principal, @ZodParam('id', idSchema) id: string) {
    return this.documents.list(id, user);
  }

  @Post()
  @ApiOperation({
    summary:
      'Hand in a file for a document (a new version) or a file question (the applicant; draft or more information asked)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'kind', 'key'],
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: ['DOCUMENT', 'ANSWER'] },
        key: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // One byte over the limit lets the service report 413 in the standard envelope.
      limits: { fileSize: MAX_FILE_BYTES + 1, files: 1, fields: 5 },
    }),
  )
  upload(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Body(new ZodValidationPipe(projectDocumentSlotSchema)) body: ProjectDocumentSlotInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.documents.upload(id, body, file, user, meta);
  }

  @Post(':documentId/download-url')
  @HttpCode(200)
  @ApiOperation({ summary: 'A short-lived signed URL of one file of the project' })
  downloadUrl(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('documentId', idSchema) documentId: string,
  ) {
    return this.documents.downloadUrl(id, documentId, user);
  }

  @Delete(':documentId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take back a file added since the last submission (the applicant; audited)',
  })
  remove(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('documentId', idSchema) documentId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.documents.remove(id, documentId, user, meta);
  }
}
