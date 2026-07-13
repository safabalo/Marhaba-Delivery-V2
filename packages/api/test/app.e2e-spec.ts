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

  async function loginCookies(email: string): Promise<string | string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Password123' });
    return res.headers['set-cookie'];
  }

  it('accepts a driver location ping over HTTP (offline outbox fallback)', async () => {
    const cookies = await loginCookies('driver@marhaba.delivery');
    const res = await request(app.getHttpServer())
      .post('/api/drivers/me/location')
      .set('Cookie', cookies)
      .send({ lng: 55.27, lat: 25.2, recordedAt: new Date().toISOString() });
    expect(res.status).toBe(202);
  });

  it('creates an order and returns a live tracking snapshot to its owner', async () => {
    const cookies = await loginCookies('client@marhaba.delivery');
    const products = await request(app.getHttpServer()).get('/api/products');
    expect(products.body.length).toBeGreaterThan(0);
    const productId = products.body[0].id as string;

    const create = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Cookie', cookies)
      .send({
        items: [{ productId, quantity: 1 }],
        dropoffAddress: { line1: '12 Marina Walk', city: 'Dubai', country: 'AE', point: { lng: 55.27, lat: 25.2 } },
        paymentMethod: 'CASH_ON_DELIVERY',
        placeNow: true,
      });
    expect(create.status).toBe(201);
    const orderId = create.body.id as string;

    const tracking = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}/tracking`)
      .set('Cookie', cookies);
    expect(tracking.status).toBe(200);
    expect(tracking.body.pickup).toBeDefined();
    expect(tracking.body.dropoff).toMatchObject({ lng: 55.27, lat: 25.2 });
    expect(tracking.body.driver).toBeNull(); // not assigned yet
  });

  it('rejects tracking for anonymous users', async () => {
    const res = await request(app.getHttpServer()).get('/api/orders/does-not-matter/tracking');
    expect(res.status).toBe(401);
  });
});
