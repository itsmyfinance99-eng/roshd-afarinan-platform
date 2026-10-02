import type { INestApplication } from '@nestjs/common';
import { MAX_ASSUMPTION_TEMPLATES } from '@roshd/validation';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

describe('Assumption templates (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const template = {
    name: 'فرض‌های پایه طرح‌های معدنی',
    description: 'برای کپی در پروژه‌های بعدی',
    assumptions: [
      {
        key: 'discountRate',
        label: 'نرخ تنزیل',
        unit: 'درصد در سال',
        value: '۰٫۱۸',
        source: 'نرخ سود سپرده بلندمدت',
        asOf: '۱۴۰۵/۰۶/۳۱',
      },
      { key: 'exchangeRate.USD', label: 'نرخ دلار', unit: 'ریال', value: '615000' },
    ],
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, lists, reads, replaces and deletes the owner’s template', async () => {
    const owner = await registerUser(app);

    const created = await http()
      .post('/api/v1/assumption-templates')
      .set(auth(owner.token))
      .send(template)
      .expect(201);
    const id = created.body.data.id as string;
    expect(created.body.data.assumptions[0]).toMatchObject({ key: 'discountRate', value: '0.18' });

    const list = await http()
      .get('/api/v1/assumption-templates')
      .set(auth(owner.token))
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({ id, name: template.name });
    expect(list.body.data[0].assumptions).toBeUndefined();

    const replaced = await http()
      .put(`/api/v1/assumption-templates/${id}`)
      .set(auth(owner.token))
      .send({ ...template, name: 'نسخه دوم', assumptions: [template.assumptions[1]] })
      .expect(200);
    expect(replaced.body.data.name).toBe('نسخه دوم');
    expect(replaced.body.data.assumptions).toHaveLength(1);

    const read = await http()
      .get(`/api/v1/assumption-templates/${id}`)
      .set(auth(owner.token))
      .expect(200);
    expect(read.body.data.assumptions[0].key).toBe('exchangeRate.USD');

    await http().delete(`/api/v1/assumption-templates/${id}`).set(auth(owner.token)).expect(200);
    await http().get(`/api/v1/assumption-templates/${id}`).set(auth(owner.token)).expect(404);

    const actions = await app
      .get(PrismaService)
      .auditLog.findMany({ where: { entityId: id }, select: { action: true } });
    expect(actions.map((a) => a.action).sort()).toEqual([
      'assumption_template.created',
      'assumption_template.deleted',
      'assumption_template.updated',
    ]);
  });

  it('hides a template from everyone else, staff included (404, never 403)', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const admin = await registerUser(app, ['admin']);
    const created = await http()
      .post('/api/v1/assumption-templates')
      .set(auth(owner.token))
      .send(template)
      .expect(201);
    const id = created.body.data.id as string;

    for (const intruder of [other, admin]) {
      await http().get(`/api/v1/assumption-templates/${id}`).set(auth(intruder.token)).expect(404);
      await http()
        .put(`/api/v1/assumption-templates/${id}`)
        .set(auth(intruder.token))
        .send(template)
        .expect(404);
      await http()
        .delete(`/api/v1/assumption-templates/${id}`)
        .set(auth(intruder.token))
        .expect(404);
      const list = await http()
        .get('/api/v1/assumption-templates')
        .set(auth(intruder.token))
        .expect(200);
      expect(list.body.data.map((t: { id: string }) => t.id)).not.toContain(id);
    }

    // Still intact for the owner
    const read = await http()
      .get(`/api/v1/assumption-templates/${id}`)
      .set(auth(owner.token))
      .expect(200);
    expect(read.body.data.name).toBe(template.name);
  });

  it('requires authentication', async () => {
    await http().get('/api/v1/assumption-templates').expect(401);
    await http().post('/api/v1/assumption-templates').send(template).expect(401);
  });

  it('validates the template with Persian messages', async () => {
    const owner = await registerUser(app);
    const empty = await http()
      .post('/api/v1/assumption-templates')
      .set(auth(owner.token))
      .send({ name: 'خالی', assumptions: [] })
      .expect(400);
    expect(empty.body.error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(empty.body.error.details)).toContain('حداقل یک فرض');

    const badNumber = await http()
      .post('/api/v1/assumption-templates')
      .set(auth(owner.token))
      .send({ ...template, assumptions: [{ ...template.assumptions[0], value: '18%' }] })
      .expect(400);
    expect(JSON.stringify(badNumber.body.error.details)).toContain('عدد معتبر');

    await http().get('/api/v1/assumption-templates/not-a-uuid').set(auth(owner.token)).expect(400);
  });

  it('caps the number of templates per user', async () => {
    const owner = await registerUser(app);
    const prisma = app.get(PrismaService);
    await prisma.assumptionTemplate.createMany({
      data: Array.from({ length: MAX_ASSUMPTION_TEMPLATES }, (_, i) => ({
        ownerId: owner.id,
        name: `الگو ${i}`,
        assumptions: template.assumptions,
      })),
    });
    const blocked = await http()
      .post('/api/v1/assumption-templates')
      .set(auth(owner.token))
      .send(template)
      .expect(409);
    expect(blocked.body.error.code).toBe('CONFLICT');
  });
});
