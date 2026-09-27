import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOTIFICATION_PROVIDER } from '../src/modules/notifications/ports/notification-provider';
import { createTestApp, registerUser } from './helpers';

describe('Tickets (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const open = (token: string, body: Record<string, unknown> = {}) =>
    http()
      .post('/api/v1/tickets')
      .set(auth(token))
      .send({ subject: 'پیگیری درخواست', message: 'وضعیت درخواست من چیست؟', ...body });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs a full conversation with status changes, internal notes and a notification', async () => {
    const owner = await registerUser(app);
    const support = await registerUser(app, ['support']);

    const created = await open(owner.token).expect(201);
    expect(created.body.data).toMatchObject({
      status: 'OPEN',
      category: 'GENERAL',
      priority: 'NORMAL',
    });
    expect(created.body.data.code).toMatch(/^TK-[0-9A-Z]{6}$/);
    const id = created.body.data.id as string;

    // Staff internal note: no status change, invisible to the owner
    const note = await http()
      .post(`/api/v1/tickets/${id}/messages`)
      .set(auth(support.token))
      .send({ body: 'یادداشت داخلی کارشناس', internal: true })
      .expect(201);
    expect(note.body.data.status).toBe('OPEN');

    // Public staff reply → ANSWERED + email notification to the owner
    const answered = await http()
      .post(`/api/v1/tickets/${id}/messages`)
      .set(auth(support.token))
      .send({ body: 'درخواست شما در حال بررسی است.' })
      .expect(201);
    expect(answered.body.data.status).toBe('ANSWERED');
    expect(answered.body.data.requester.email).toBe(owner.email);
    const sent = app.get(NOTIFICATION_PROVIDER).sent.at(-1);
    expect(sent).toMatchObject({ channel: 'email', to: owner.email, template: 'ticket.answered' });

    const ownerView = await http().get(`/api/v1/tickets/${id}`).set(auth(owner.token)).expect(200);
    expect(ownerView.body.data.messages.map((m: { body: string }) => m.body)).toEqual([
      'وضعیت درخواست من چیست؟',
      'درخواست شما در حال بررسی است.',
    ]);
    expect(ownerView.body.data.requester).toBeUndefined();
    expect(
      ownerView.body.data.messages.every(
        (m: { authorName: string | null }) => m.authorName === null,
      ),
    ).toBe(true);

    // Owner reply → OPEN again
    const reopened = await http()
      .post(`/api/v1/tickets/${id}/messages`)
      .set(auth(owner.token))
      .send({ body: 'متشکرم، منتظر می‌مانم.' })
      .expect(201);
    expect(reopened.body.data.status).toBe('OPEN');

    // Owner closes; closed tickets accept no messages
    await http()
      .patch(`/api/v1/tickets/${id}/status`)
      .set(auth(owner.token))
      .send({ status: 'CLOSED' })
      .expect(200);
    const blocked = await http()
      .post(`/api/v1/tickets/${id}/messages`)
      .set(auth(owner.token))
      .send({ body: 'سؤال دیگر' })
      .expect(409);
    expect(blocked.body.error.code).toBe('CONFLICT');
  });

  it('keeps tickets private and support-only actions protected', async () => {
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const id = (await open(owner.token).expect(201)).body.data.id as string;

    await http().get(`/api/v1/tickets/${id}`).set(auth(stranger.token)).expect(404);
    await http()
      .post(`/api/v1/tickets/${id}/messages`)
      .set(auth(stranger.token))
      .send({ body: 'دخالت' })
      .expect(404);
    await http().get('/api/v1/tickets').set(auth(owner.token)).expect(403);
    await http().get(`/api/v1/tickets/${id}`).expect(401);

    // Owners cannot write internal notes or set staff-only statuses
    await http()
      .post(`/api/v1/tickets/${id}/messages`)
      .set(auth(owner.token))
      .send({ body: 'یادداشت', internal: true })
      .expect(403);
    await http()
      .patch(`/api/v1/tickets/${id}/status`)
      .set(auth(owner.token))
      .send({ status: 'PENDING' })
      .expect(403);

    const mine = await http().get('/api/v1/tickets/mine').set(auth(stranger.token)).expect(200);
    expect(mine.body.data).toHaveLength(0);
  });

  it("links only the owner's own service requests", async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const requestId = (
      await http()
        .post('/api/v1/service-requests')
        .set(auth(other.token))
        .send({
          type: 'CONTACT',
          fullName: 'دیگری',
          mobile: '09120000009',
          message: 'پیام آزمایشی دیگر',
        })
        .expect(201)
    ).body.data.id as string;
    const res = await open(owner.token, { serviceRequestId: requestId }).expect(400);
    expect(res.body.error.details[0].path).toBe('serviceRequestId');

    const own = (
      await http()
        .post('/api/v1/service-requests')
        .set(auth(owner.token))
        .send({
          type: 'CONTACT',
          fullName: 'مالک',
          mobile: '09120000008',
          message: 'پیام آزمایشی مالک',
        })
        .expect(201)
    ).body.data.id as string;
    const linked = await open(owner.token, { serviceRequestId: own, category: 'REQUEST' }).expect(
      201,
    );
    expect(linked.body.data.serviceRequestId).toBe(own);
  });

  it('attaches ticket files readable by support', async () => {
    const owner = await registerUser(app);
    const support = await registerUser(app, ['support']);
    const fileId = (
      await http()
        .post('/api/v1/files')
        .set(auth(owner.token))
        .field('purpose', 'TICKET_ATTACHMENT')
        .attach('file', Buffer.from('%PDF-1.7\n%%EOF\n'), 'screen.pdf')
        .expect(201)
    ).body.data.id as string;
    const ticket = await open(owner.token, { attachmentIds: [fileId] }).expect(201);
    expect(ticket.body.data.attachments.map((f: { id: string }) => f.id)).toEqual([fileId]);
    await http().post(`/api/v1/files/${fileId}/download-url`).set(auth(support.token)).expect(200);
  });
});
