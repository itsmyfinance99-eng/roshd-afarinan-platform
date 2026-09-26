import { Controller, Get, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  idSchema,
  MAX_FILE_BYTES,
  paginationQuerySchema,
  type PaginationQuery,
} from '@roshd/validation';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/http/envelope.interceptor';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodParam, ZodQuery } from '../../common/http/zod';
import { CurrentUser, type Principal } from '../rbac/principal';
import { FilesService, type UploadedFile as UploadedFileData } from './files.service';

/**
 * Public media library (ST-25.07): images for articles, courses, research and investment
 * pages. Managing it needs cms:write or catalog:manage (checked in FilesService); reading an
 * image is public and same-origin through the web app's /api rewrite.
 */
@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a public image (PNG, JPEG, WebP; cms:write or catalog:manage)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // One byte over the limit lets the service report 413 in the standard envelope.
      limits: { fileSize: MAX_FILE_BYTES + 1, files: 1, fields: 2 },
    }),
  )
  upload(
    @CurrentUser() user: Principal,
    @UploadedFile() file: UploadedFileData | undefined,
    @Meta() meta: RequestMeta,
  ) {
    return this.files.uploadPublicImage(user, file, meta);
  }

  @Get()
  @ApiOperation({ summary: 'Media library, newest first (cms:write or catalog:manage)' })
  list(@CurrentUser() user: Principal, @ZodQuery(paginationQuerySchema) query: PaginationQuery) {
    return this.files.listPublicImages(user, query.page, query.pageSize);
  }

  @Public()
  @RawResponse()
  @Get(':id')
  @ApiOperation({ summary: 'Public image bytes (immutable; private files are never served)' })
  async content(
    @ZodParam('id', idSchema) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { file, open } = await this.files.openPublicImage(id);
    const etag = `"${file.checksum}"`;
    // The bytes behind an id never change, so browsers and proxies may cache them for good.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition', 'inline');
    (await open()).pipe(res);
  }
}
