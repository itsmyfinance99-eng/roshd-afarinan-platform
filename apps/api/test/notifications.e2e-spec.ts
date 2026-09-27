import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOTIFICATION_PROVIDER } from '../src/modules/notifications/ports/notification-provider';
import { createTestApp, registerUser } from './helpers';

interface Item {
  id: string;
  kind: string;
  title: string;
  link: string | null;
  readAt: string | null;
}

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const mine = async (token: string): Promise<Item[]> =>
    (await http().get('/api/v1/notifications/mine?pageSize=100').set(auth(token)).expect(200)).body
      .data as Item[];

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('tells staff about new requests and the requester about status changes', async () => {
    const support = await registerUser(app, ['support']);
    const owner = await registerUser(app);
    const outsider = await registerUser(app);

    const created = await http()
      .post('/api/v1/service-requests')
      .set(auth(owner.token))
      .send({
        type: 'CONTACT',
        fullName: 'مالک',
        mobile: '09120000033',
        message: 'پیام آزمایشی برای اعلان',
      })
      .expect(201);
    const id = created.body.data.id as string;
    const staffInbox = await mine(support.token);
    expect(staffInbox.find((n) => n.link === `/dashboard/manage/requests/${id}`)).toMatchObject({
      kind: 'service_request.created',
    });
    expect((await mine(outsider.token)).some((n) => n.link?.includes(id))).toBe(false);

    await http()
      .patch(`/api/v1/service-requests/${id}/status`)
      .set(auth(support.token))
      .send({ status: 'IN_REVIEW' })
      .expect(200);
    const ownerInbox = await mine(owner.token);
    expect(ownerInbox[0]).toMatchObject({
      kind: 'service_request.status_changed',
      link: `/dashboard/requests/${id}`,
      readAt: null,
    });
    expect(ownerInbox[0]?.title).toContain('در حال بررسی');
    expect(app.get(NOTIFICATION_PROVIDER).sent.at(-1)).toMatchObject({
      to: owner.email,
      template: 'service-request.status-changed',
    });

    // Unread count, mark one read, mark all read
    const count = await http().get('/api/v1/notifications/unread-count').set(auth(owner.token));
    expect(count.body.data.unread).toBe(1);
    const read = await http()
      .post(`/api/v1/notifications/${ownerInbox[0]?.id}/read`)
      .set(auth(owner.token))
      .expect(200);
    expect(read.body.data.unread).toBe(0);
    const unreadOnly = await http()
      .get('/api/v1/notifications/mine?unread=true')
      .set(auth(owner.token))
      .expect(200);
    expect(unreadOnly.body.data).toHaveLength(0);
  });

  it('emails guests about status changes of their requests', async () => {
    const support = await registerUser(app, ['support']);
    const guest = await http()
      .post('/api/v1/service-requests')
      .send({
        type: 'CONTACT',
        fullName: 'مهمان',
        mobile: '09120000034',
        email: 'guest-notify@example.com',
        message: 'پیام مهمان برای اعلان',
      })
      .expect(201);
    await http()
      .patch(`/api/v1/service-requests/${guest.body.data.id}/status`)
      .set(auth(support.token))
      .send({ status: 'IN_REVIEW' })
      .expect(200);
    expect(app.get(NOTIFICATION_PROVIDER).sent.at(-1)).toMatchObject({
      to: 'guest-notify@example.com',
      template: 'service-request.status-changed',
    });
  });

  it('routes ticket events between the owner and support', async () => {
    const support = await registerUser(app, ['support']);
    const owner = await registerUser(app);
    const ticket = await http()
      .post('/api/v1/tickets')
      .set(auth(owner.token))
      .send({ subject: 'سؤال درباره درخواست', message: 'وضعیت درخواست من چیست؟' })
      .expect(201);
    const id = ticket.body.data.id as string;
    expect(
      (await mine(support.token)).find((n) => n.link === `/dashboard/manage/tickets/${id}`),
    ).toMatchObject({ kind: 'ticket.created' });

    await http()
      .post(`/api/v1/tickets/${id}/messages`)
      .set(auth(support.token))
      .send({ body: 'یادداشت داخلی', internal: true })
      .expect(201);
    expect((await mine(owner.token)).some((n) => n.kind === 'ticket.answered')).toBe(false);

    await http()
      .post(`/api/v1/tickets/${id}/messages`)
      .set(auth(support.token))
      .send({ body: 'درخواست شما بررسی شد.' })
      .expect(201);
    expect((await mine(owner.token))[0]).toMatchObject({
      kind: 'ticket.answered',
      link: `/dashboard/tickets/${id}`,
    });

    await http()
      .post(`/api/v1/tickets/${id}/messages`)
      .set(auth(owner.token))
      .send({ body: 'متشکرم، سؤال دیگری هم دارم.' })
      .expect(201);
    const staffInbox = await mine(support.token);
    expect(staffInbox[0]).toMatchObject({ kind: 'ticket.replied' });
    // Nobody is notified about their own message
    expect((await mine(owner.token)).some((n) => n.kind === 'ticket.replied')).toBe(false);
  });

  it('keeps notifications private', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const support = await registerUser(app, ['support']);
    const created = await http()
      .post('/api/v1/service-requests')
      .set(auth(owner.token))
      .send({
        type: 'CONTACT',
        fullName: 'مالک',
        mobile: '09120000035',
        message: 'پیام خصوصی آزمایشی',
      })
      .expect(201);
    await http()
      .patch(`/api/v1/service-requests/${created.body.data.id}/status`)
      .set(auth(support.token))
      .send({ status: 'IN_REVIEW' })
      .expect(200);
    const [first] = await mine(owner.token);

    await http().post(`/api/v1/notifications/${first?.id}/read`).set(auth(other.token)).expect(404);
    await http().get('/api/v1/notifications/mine').expect(401);
    await http().get('/api/v1/notifications/unread-count').expect(401);
    await http().post('/api/v1/notifications/read-all').set(auth(owner.token)).expect(200);
    expect((await mine(owner.token)).every((n) => n.readAt !== null)).toBe(true);
    await http().post('/api/v1/notifications/not-a-uuid/read').set(auth(owner.token)).expect(400);
  });
});
