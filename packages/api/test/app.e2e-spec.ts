import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

/**
 * End-to-end smoke test. Requires the CI services (PostGIS + Redis) and seed
 * data. Exercises the security-critical happy path: health, auth, RBAC.
 */
describe('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports liveness', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/orders');
    expect(res.status).toBe(401);
  });

  it('logs in a seeded dispatcher and sets auth cookies', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dispatcher@marhaba.delivery', password: 'Password123' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('DISPATCHER');
    const cookies = res.headers['set-cookie'];
    expect(Array.isArray(cookies) ? cookies.join(';') : cookies).toContain('mrb_access');
  });

  it('lets an authenticated dispatcher read the dispatch board', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dispatcher@marhaba.delivery', password: 'Password123' });
    const cookies = login.headers['set-cookie'];
    const res = await request(app.getHttpServer())
      .get('/api/dispatch/board')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
