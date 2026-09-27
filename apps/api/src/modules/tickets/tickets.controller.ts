import { Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignSchema,
  createTicketSchema,
  idSchema,
  listTicketsQuerySchema,
  replyTicketSchema,
  updateTicketStatusSchema,
  type AssignInput,
  type CreateTicketInput,
  type ListTicketsQuery,
  type ReplyTicketInput,
  type UpdateTicketStatusInput,
} from '@roshd/validation';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  @ApiOperation({ summary: 'Open a support ticket' })
  create(
    @CurrentUser() user: Principal,
    @ZodBody(createTicketSchema) body: CreateTicketInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.tickets.create(body, user, meta);
  }

  @Get('mine')
  @ApiOperation({ summary: "The signed-in user's tickets" })
  mine(@CurrentUser() user: Principal, @ZodQuery(listTicketsQuerySchema) query: ListTicketsQuery) {
    return this.tickets.listMine(user.userId, query);
  }

  @Get()
  @RequirePermissions('tickets:read-all')
  @ApiOperation({ summary: 'All tickets (support); assignee=me|none filters by assignment' })
  list(@CurrentUser() user: Principal, @ZodQuery(listTicketsQuerySchema) query: ListTicketsQuery) {
    return this.tickets.listAll(query, user);
  }

  @Get('assignees')
  @RequirePermissions('tickets:reply')
  @ApiOperation({ summary: 'Active support staff a ticket can be assigned to' })
  assignees() {
    return this.tickets.assignees();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ticket conversation (owner or support; others 404)' })
  get(@CurrentUser() user: Principal, @ZodParam('id', idSchema) id: string) {
    return this.tickets.getVisible(id, user);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Reply (owner) or answer / add an internal note (support)' })
  reply(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(replyTicketSchema) body: ReplyTicketInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.tickets.reply(id, body, user, meta);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change status (support: any; owner: close only)' })
  changeStatus(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(updateTicketStatusSchema) body: UpdateTicketStatusInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.tickets.changeStatus(id, body, user, meta);
  }

  @Patch(':id/assignee')
  @RequirePermissions('tickets:reply')
  @ApiOperation({ summary: 'Assign or unassign a support agent (audited; notifies the assignee)' })
  assign(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(assignSchema) body: AssignInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.tickets.assign(id, body, user, meta);
  }
}
