import { Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createTicketSchema,
  idSchema,
  listTicketsQuerySchema,
  replyTicketSchema,
  updateTicketStatusSchema,
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
  @ApiOperation({ summary: 'All tickets (support)' })
  list(@ZodQuery(listTicketsQuerySchema) query: ListTicketsQuery) {
    return this.tickets.listAll(query);
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
}
