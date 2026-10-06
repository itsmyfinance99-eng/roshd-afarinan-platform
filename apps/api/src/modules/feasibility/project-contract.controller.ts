import { Controller, Get, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  confirmContractSchema,
  idSchema,
  MAX_FILE_BYTES,
  type ConfirmContractInput,
} from '@roshd/validation';
import { memoryStorage } from 'multer';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam } from '../../common/http/zod';
import type { UploadedFile as UploadedFileData } from '../files/files.service';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { FeasibilityProjectsService } from './feasibility-projects.service';
import { ProjectContractService } from './project-contract.service';

/**
 * The contract of a feasibility study (ST-35.09). Every route needs a signed-in user; the
 * service checks that the caller is the applicant of the project or staff, and a project the
 * caller has no relation to does not exist (404). The bytes of a copy are only ever served
 * through a signed URL.
 */
@ApiTags('feasibility')
@Controller('feasibility-projects/:id/contract')
export class ProjectContractController {
  constructor(
    private readonly contract: ProjectContractService,
    private readonly projects: FeasibilityProjectsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The copies of the contract of the project (the applicant and staff)' })
  list(@CurrentUser() user: Principal, @ZodParam('id', idSchema) id: string) {
    return this.contract.list(id, user);
  }

  @Post()
  @ApiOperation({
    summary:
      'Hand in a copy of the signed contract (the applicant or staff; while the contract is pending)',
  })
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
      limits: { fileSize: MAX_FILE_BYTES + 1, files: 1, fields: 5 },
    }),
  )
  upload(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Meta() meta: RequestMeta,
  ) {
    return this.contract.upload(id, file, user, meta);
  }

  @Post(':contractId/download-url')
  @HttpCode(200)
  @ApiOperation({ summary: 'A short-lived signed URL of one copy of the contract' })
  downloadUrl(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('contractId', idSchema) contractId: string,
  ) {
    return this.contract.downloadUrl(id, contractId, user);
  }

  @Post(':contractId/confirm')
  @HttpCode(200)
  @RequirePermissions('feasibility:manage')
  @ApiOperation({
    summary:
      'Confirm a copy of the signed contract; the work on the study starts (audited, notified)',
  })
  confirm(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('contractId', idSchema) contractId: string,
    @ZodBody(confirmContractSchema) body: ConfirmContractInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.projects.confirmContract(id, contractId, body, user, meta);
  }
}
