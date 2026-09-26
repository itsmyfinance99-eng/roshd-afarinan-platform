import { Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  z,
  type CreateOrderInput,
  type ListOrdersQuery,
} from '@roshd/validation';
import type { Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { Public } from '../../common/decorators/public.decorator';
import { RawResponse } from '../../common/http/envelope.interceptor';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { StrictRateLimit } from '../../common/http/strict-rate-limit';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { OrdersService } from './orders.service';

const idParam = z.uuid();

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create an order for published, priced courses (server-side prices)' })
  create(
    @ZodBody(createOrderSchema) body: CreateOrderInput,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.orders.create(body, user, meta);
  }

  @Get('mine')
  @ApiOperation({ summary: "The signed-in user's orders" })
  mine(@CurrentUser() user: Principal, @ZodQuery(listOrdersQuerySchema) query: ListOrdersQuery) {
    return this.orders.listMine(user.userId, query);
  }

  @Get()
  @RequirePermissions('orders:read-all')
  @ApiOperation({ summary: 'All orders (finance)' })
  list(@ZodQuery(listOrdersQuerySchema) query: ListOrdersQuery) {
    return this.orders.listAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One order with its payment attempts (owner or finance)' })
  get(@ZodParam('id', idParam) id: string, @CurrentUser() user: Principal) {
    return this.orders.getVisible(id, user);
  }

  @Post(':id/pay')
  @HttpCode(200)
  @StrictRateLimit()
  @ApiOperation({ summary: 'Start a payment attempt; returns the gateway redirect URL' })
  pay(
    @ZodParam('id', idParam) id: string,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.orders.startPayment(id, user, meta);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a pending order' })
  cancel(
    @ZodParam('id', idParam) id: string,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.orders.cancel(id, user, meta);
  }
}

/** Only short string parameters from the provider are passed to verification. */
function callbackParams(query: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query)
      .filter(
        ([key, value]) => typeof value === 'string' && key.length <= 40 && value.length <= 500,
      )
      .slice(0, 20),
  ) as Record<string, string>;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly orders: OrdersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Whether online payment is available (no secrets)' })
  status() {
    return this.orders.paymentStatus();
  }

  @Public()
  @RawResponse()
  @Get('callback/:attemptId')
  @ApiOperation({
    summary: 'Gateway return URL: verifies server-to-server, then redirects to the order page',
  })
  async callback(
    @Param('attemptId') attemptId: string,
    @Query() query: Record<string, unknown>,
    @Meta() meta: RequestMeta,
    @Res() res: Response,
  ): Promise<void> {
    const valid = idParam.safeParse(attemptId);
    const { orderId, outcome } = valid.success
      ? await this.orders.handleCallback(valid.data, callbackParams(query), meta)
      : { orderId: null, outcome: 'unknown' as const };
    const target = orderId
      ? `${this.config.WEB_BASE_URL}/dashboard/orders/${orderId}?payment=${outcome}`
      : `${this.config.WEB_BASE_URL}/dashboard/orders?payment=unknown`;
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(303, target);
  }
}
