import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  idSchema,
  listFilesQuerySchema,
  MAX_FILE_BYTES,
  paginationQuerySchema,
  uploadFileSchema,
  z,
  type ListFilesQuery,
  type PaginationQuery,
  type UploadFileInput,
} from '@roshd/validation';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/http/envelope.interceptor';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodParam, ZodQuery, ZodValidationPipe } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { FilesService, type UploadedFile as UploadedFileData } from './files.service';

const signedQuerySchema = z.object({
  exp: z.coerce.number().int().positive(),
  sig: z.string().min(10).max(128),
});

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a private file (PDF, image, Word, Excel; max 8 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        purpose: {
          type: 'string',
          enum: ['SERVICE_REQUEST_ATTACHMENT', 'TICKET_ATTACHMENT', 'USER_DOCUMENT'],
        },
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
    @UploadedFile() file: UploadedFileData | undefined,
    @Body(new ZodValidationPipe(uploadFileSchema)) body: UploadFileInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.files.upload(user, file, body.purpose, meta);
  }

  @Get('mine')
  @ApiOperation({ summary: "The signed-in user's files" })
  mine(@CurrentUser() user: Principal, @ZodQuery(paginationQuerySchema) query: PaginationQuery) {
    return this.files.listMine(user.userId, query.page, query.pageSize);
  }

  @Get()
  @RequirePermissions('files:read-all')
  @ApiOperation({ summary: "Every user's files (staff browser)" })
  list(@ZodQuery(listFilesQuerySchema) query: ListFilesQuery) {
    return this.files.listAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'File metadata (owner or authorized staff; others 404)' })
  get(@CurrentUser() user: Principal, @ZodParam('id', idSchema) id: string) {
    return this.files.getVisible(id, user);
  }

  @Post(':id/download-url')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a short-lived signed download URL' })
  downloadUrl(@CurrentUser() user: Principal, @ZodParam('id', idSchema) id: string) {
    return this.files.createDownloadUrl(id, user);
  }

  @Public()
  @RawResponse()
  @Get(':id/content')
  @ApiOperation({ summary: 'Download via signed URL (403 when invalid or expired)' })
  async content(
    @ZodParam('id', idSchema) id: string,
    @ZodQuery(signedQuerySchema) query: z.infer<typeof signedQuerySchema>,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, file } = await this.files.openSigned(id, query.exp, query.sig);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    stream.pipe(res);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete an unattached file you own, or any file with files:read-all',
  })
  async remove(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<null> {
    await this.files.remove(id, user, meta);
    return null;
  }
}
