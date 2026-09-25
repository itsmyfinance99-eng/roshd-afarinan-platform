import { Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createServiceRequestSchema,
  idSchema,
  listServiceRequestsQuerySchema,
  trackServiceRequestSchema,
  updateServiceRequestStatusSchema,
  type CreateServiceRequestInput,
  type ListServiceRequestsQuery,
  type TrackServiceRequestInput,
  type UpdateServiceRequestStatusInput,
} from '@roshd/validation';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import type { PageResult } from '../../common/http/page-result';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { StrictRateLimit } from '../../common/http/strict-rate-limit';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, principalOf, type Principal } from '../rbac/principal';
import {
  ServiceRequestsService,
  type ServiceRequestDetailView,
  type ServiceRequestReceipt,
  type ServiceRequestView,
} from './service-requests.service';

@ApiTags('service-requests')
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(private readonly requests: ServiceRequestsService) {}

  @Public()
  @StrictRateLimit()
  @Post()
  @ApiOperation({
    summary: 'Submit a service request (guest or signed-in); returns a tracking code',
  })
  create(
    @ZodBody(createServiceRequestSchema) body: CreateServiceRequestInput,
    @Req() req: Request,
    @Meta() meta: RequestMeta,
  ): Promise<ServiceRequestReceipt> {
    return this.requests.create(body, principalOf(req), meta);
  }

  @Public()
  @StrictRateLimit()
  @Get('track')
  @ApiOperation({ summary: 'Track a request with its code and the submitter mobile number' })
  track(@ZodQuery(trackServiceRequestSchema) query: TrackServiceRequestInput) {
    return this.requests.track(query);
  }

  @Get('mine')
  @ApiOperation({ summary: "The signed-in user's requests" })
  mine(
    @CurrentUser() user: Principal,
    @ZodQuery(listServiceRequestsQuerySchema) query: ListServiceRequestsQuery,
  ): Promise<PageResult<ServiceRequestView>> {
    return this.requests.listMine(user.userId, query);
  }

  @Get()
  @RequirePermissions('requests:read-all')
  @ApiOperation({ summary: 'All requests (staff)' })
  list(
    @ZodQuery(listServiceRequestsQuerySchema) query: ListServiceRequestsQuery,
  ): Promise<PageResult<ServiceRequestView>> {
    return this.requests.listAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One request (owner or staff) with its status timeline' })
  get(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
  ): Promise<ServiceRequestDetailView> {
    return this.requests.getVisible(id, user);
  }

  @Patch(':id/status')
  @RequirePermissions('requests:manage')
  @ApiOperation({ summary: 'Change request status (staff; audited)' })
  changeStatus(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(updateServiceRequestStatusSchema) body: UpdateServiceRequestStatusInput,
    @Meta() meta: RequestMeta,
  ): Promise<ServiceRequestDetailView> {
    return this.requests.changeStatus(id, body, user, meta);
  }
}
