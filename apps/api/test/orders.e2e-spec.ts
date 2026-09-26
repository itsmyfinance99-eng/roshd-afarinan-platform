import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { NOTIFICATION_PROVIDER } from '../src/modules/notifications/ports/notification-provider';
import { createTestApp, registerUser } from './helpers';

const slug = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

describe('Orders and payments (e2e)', () => {
  let app: INestApplication;
  let editor: { token: string };
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Creates and publishes a course; returns its slug. */
  async function course(body: Record<string, unknown> = {}, publish = true) {
    const created = await http()
      .post('/api/v1/catalog/courses')
      .set(auth(editor.token))
      .send({
        slug: slug('course'),
        title: 'ارزیابی مالی طرح‌ها',
        summary: 'آشنایی با روش‌های ارزیابی مالی طرح‌های سرمایه‌گذاری',
        description: 'متن',
        level: 'ADVANCED',
        deliveryMode: 'ONLINE',
        priceRials: '25000000',
        ...body,
      })
      .expect(201);
    if (publish) {
      await http()
        .post(`/api/v1/catalog/courses/${created.body.data.id}/publish`)
        .set(auth(editor.token))
        .expect(200);
    }
    return created.body.data.slug as string;
  }

  const order = (token: string, courseSlug: string, extra: Record<string, unknown> = {}) =>
    http()
      .post('/api/v1/orders')
      .set(auth(token))
      .send({ items: [{ kind: 'COURSE', slug: courseSlug, ...extra }] });

  const pay = (token: string, orderId: string) =>
    http().post(`/api/v1/orders/${orderId}/pay`).set(auth(token));

  const callback = (attemptId: string, query: Record<string, string>) =>
    http().get(`/api/v1/payments/callback/${attemptId}`).query(query).redirects(0);

  beforeAll(async () => {
    app = await createTestApp();
    editor = await registerUser(app, ['editor']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports that the (mock) gateway is available', async () => {
    const res = await http().get('/api/v1/payments/status').expect(200);
    expect(res.body.data).toEqual({ enabled: true, testMode: true });
  });

  it('prices orders on the server and reuses a pending order for the same course', async () => {
    const buyer = await registerUser(app);
    const s = await course();
    const created = await order(buyer.token, s, { priceRials: '1' }).expect(201);
    expect(created.body.data).toMatchObject({
      status: 'PENDING_PAYMENT',
      totalRials: '25000000',
      items: [{ referenceSlug: s, unitPriceRials: '25000000', quantity: 1 }],
    });
    expect(created.body.data.code).toMatch(/^OR-[0-9A-Z]{8}$/);
    expect(created.body.data.userId).toBeUndefined();

    const again = await order(buyer.token, s).expect(201);
    expect(again.body.data.id).toBe(created.body.data.id);
  });

  it('refuses free, unpriced, unpublished and unknown courses', async () => {
    const buyer = await registerUser(app);
    for (const s of [
      await course({ isFree: true, priceRials: null }),
      await course({ priceRials: null }),
      await course({}, false),
      'no-such-course',
    ]) {
      const res = await order(buyer.token, s).expect(400);
      expect(res.body.error.details[0].path).toBe('items.0.slug');
    }
    await http().post('/api/v1/orders').set(auth(buyer.token)).send({ items: [] }).expect(400);
  });

  it('pays only after server-side verification; replays and re-payment are no-ops or 409', async () => {
    const buyer = await registerUser(app);
    const prisma = app.get(PrismaService);
    const orderId = (await order(buyer.token, await course()).expect(201)).body.data.id as string;

    // 1) The payer cancels at the gateway → attempt fails, order stays pending
    const first = await pay(buyer.token, orderId).expect(200);
    expect(first.body.data.redirectUrl).toContain('/mock-gateway/MOCK-');
    const cancelled = await callback(first.body.data.attemptId, { status: 'NOK' }).expect(303);
    expect(cancelled.headers.location).toMatch(
      new RegExp(`/dashboard/orders/${orderId}\\?payment=failed$`),
    );
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(
      'PENDING_PAYMENT',
    );

    // 2) A tampered amount never verifies, even with a "success" return
    const tampered = await pay(buyer.token, orderId).expect(200);
    await prisma.paymentAttempt.update({
      where: { id: tampered.body.data.attemptId as string },
      data: { amountRials: '1' },
    });
    await callback(tampered.body.data.attemptId, { status: 'OK' }).expect(303);
    const tamperedRow = await prisma.paymentAttempt.findUnique({
      where: { id: tampered.body.data.attemptId as string },
    });
    expect(tamperedRow).toMatchObject({ status: 'FAILED', failureReason: 'amount_mismatch' });

    // 3) A real success is verified server-to-server
    const ok = await pay(buyer.token, orderId).expect(200);
    const paid = await callback(ok.body.data.attemptId, { status: 'OK' }).expect(303);
    expect(paid.headers.location).toMatch(/\?payment=paid$/);
    const detail = await http().get(`/api/v1/orders/${orderId}`).set(auth(buyer.token)).expect(200);
    expect(detail.body.data.status).toBe('PAID');
    expect(detail.body.data.paidAt).not.toBeNull();
    expect(detail.body.data.attempts[0]).toMatchObject({ status: 'VERIFIED' });
    expect(detail.body.data.attempts[0].trackingCode).toMatch(/^TRK-/);
    expect(detail.body.data.attempts[0].idempotencyKey).toBeUndefined();
    const sent = app.get(NOTIFICATION_PROVIDER).sent.at(-1);
    expect(sent).toMatchObject({ to: buyer.email, template: 'order.paid' });

    // 4) Replaying the callback is a no-op
    await callback(ok.body.data.attemptId, { status: 'OK' }).expect(303);
    const paidEvents = await prisma.auditLog.count({
      where: { action: 'order.paid', entityId: orderId },
    });
    expect(paidEvents).toBe(1);

    // 5) A paid order cannot be paid again or cancelled
    const again = await pay(buyer.token, orderId).expect(409);
    expect(again.body.error.code).toBe('CONFLICT');
    await http().post(`/api/v1/orders/${orderId}/cancel`).set(auth(buyer.token)).expect(409);

    const audited = await prisma.auditLog.findMany({
      where: { entityType: 'order', entityId: orderId },
      select: { action: true },
    });
    expect(audited.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'order.created',
        'payment.initiated',
        'payment.failed',
        'payment.verified',
        'order.paid',
      ]),
    );
  });

  it('rejects a return for an attempt the gateway never issued', async () => {
    const buyer = await registerUser(app);
    const prisma = app.get(PrismaService);
    const orderId = (await order(buyer.token, await course()).expect(201)).body.data.id as string;
    const forged = await prisma.paymentAttempt.create({
      data: {
        orderId,
        provider: 'mock',
        amountRials: '25000000',
        idempotencyKey: randomUUID(),
        providerReference: `MOCK-FORGED-${randomUUID().slice(0, 6)}`,
      },
    });
    await callback(forged.id, { status: 'OK' }).expect(303);
    expect((await prisma.paymentAttempt.findUnique({ where: { id: forged.id } }))?.status).toBe(
      'FAILED',
    );
    expect((await prisma.order.findUnique({ where: { id: orderId } }))?.status).toBe(
      'PENDING_PAYMENT',
    );

    const unknown = await callback(randomUUID(), { status: 'OK' }).expect(303);
    expect(unknown.headers.location).toMatch(/\/dashboard\/orders\?payment=unknown$/);
    const malformed = await callback('not-a-uuid', { status: 'OK' }).expect(303);
    expect(malformed.headers.location).toMatch(/payment=unknown$/);
  });

  it('lets owners cancel pending orders and keeps orders private', async () => {
    const buyer = await registerUser(app);
    const stranger = await registerUser(app);
    const finance = await registerUser(app, ['finance']);
    const orderId = (await order(buyer.token, await course()).expect(201)).body.data.id as string;

    await http().get(`/api/v1/orders/${orderId}`).set(auth(stranger.token)).expect(404);
    await pay(stranger.token, orderId).expect(404);
    await http().post(`/api/v1/orders/${orderId}/cancel`).set(auth(stranger.token)).expect(404);
    await http().get('/api/v1/orders').set(auth(buyer.token)).expect(403);
    await http().get('/api/v1/orders/mine').expect(401);
    await http().post('/api/v1/orders').send({ items: [] }).expect(401);

    await http().get(`/api/v1/orders/${orderId}`).set(auth(finance.token)).expect(200);
    const all = await http()
      .get('/api/v1/orders?status=PENDING_PAYMENT')
      .set(auth(finance.token))
      .expect(200);
    expect(all.body.data.map((o: { id: string }) => o.id)).toContain(orderId);
    // Finance can read but never act on someone else's order
    await pay(finance.token, orderId).expect(404);

    const cancelled = await http()
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set(auth(buyer.token))
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    await pay(buyer.token, orderId).expect(409);

    const mine = await http().get('/api/v1/orders/mine').set(auth(buyer.token)).expect(200);
    expect(mine.body.data.map((o: { id: string }) => o.id)).toEqual([orderId]);
  });
});
