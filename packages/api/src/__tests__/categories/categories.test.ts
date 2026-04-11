import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../server.js';
import { registerRoutes } from '../../app.js';
import { connectDB, disconnectDB } from '../../infrastructure/db/connection.js';
import { connectRedis, disconnectRedis, getRedisClient } from '../../infrastructure/redis/client.js';
import { MongoUserRepository } from '../../infrastructure/repositories/MongoUserRepository.js';
import { MongoAccountRepository } from '../../infrastructure/repositories/MongoAccountRepository.js';
import { MongoCategoryRepository } from '../../infrastructure/repositories/MongoCategoryRepository.js';
import { UserModel } from '../../infrastructure/db/UserModel.js';
import { CategoryModel } from '../../infrastructure/db/CategoryModel.js';

const TEST_MONGO_URI = 'mongodb://localhost:27017/financas_test';
const TEST_REDIS_URI = 'redis://localhost:6379';

let app: FastifyInstance;

beforeAll(async () => {
  await connectDB(TEST_MONGO_URI);
  connectRedis(TEST_REDIS_URI);
  const redis = getRedisClient();
  const userRepo = new MongoUserRepository();
  const accountRepo = new MongoAccountRepository();
  const categoryRepo = new MongoCategoryRepository();
  app = await buildServer();
  await registerRoutes(app, { userRepo, redis, accountRepo, categoryRepo });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await disconnectDB();
  await disconnectRedis();
});

beforeEach(async () => {
  const redis = getRedisClient();
  await UserModel.deleteMany({});
  await CategoryModel.deleteMany({});
  await redis.del('login:127.0.0.1');
  const keys = await redis.keys('refresh:*');
  if (keys.length) {
    await redis.del(...keys);
  }
});

async function registerAndLogin(app: FastifyInstance, email = 'user@test.com'): Promise<string> {
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'pass123' },
  });
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: 'pass123' },
  });
  return res.json().accessToken as string;
}

describe('POST /categories', () => {
  it('201 creates Alimentação', async () => {
    const token = await registerAndLogin(app);
    const res = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'Alimentação' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty('id');
    expect(body.name).toBe('Alimentação');
  });

  it('409 on duplicate name (same user, same name case-insensitive)', async () => {
    const token = await registerAndLogin(app);
    await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'Alimentação' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'ALIMENTAÇÃO' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('401 without Bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/categories',
      payload: { name: 'Alimentação' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('GET /categories', () => {
  it('returns only current user\'s categories (ownership isolation)', async () => {
    const token1 = await registerAndLogin(app, 'user1@test.com');
    const token2 = await registerAndLogin(app, 'user2@test.com');

    await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token1}` },
      payload: { name: 'User1 Category' },
    });
    await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token2}` },
      payload: { name: 'User2 Category' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/categories',
      headers: { Authorization: `Bearer ${token1}` },
    });

    expect(res.statusCode).toBe(200);
    const categories = res.json();
    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe('User1 Category');
  });

  it('401 without Bearer token', async () => {
    const res = await app.inject({ method: 'GET', url: '/categories' });

    expect(res.statusCode).toBe(401);
  });
});

describe('PUT /categories/:id', () => {
  it('200 updates category name', async () => {
    const token = await registerAndLogin(app);
    const createRes = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'Original' },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'PUT',
      url: `/categories/${id}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Updated');
  });

  it('403 wrong user', async () => {
    const token1 = await registerAndLogin(app, 'owner@test.com');
    const token2 = await registerAndLogin(app, 'attacker@test.com');

    const createRes = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token1}` },
      payload: { name: 'Owner Category' },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'PUT',
      url: `/categories/${id}`,
      headers: { Authorization: `Bearer ${token2}` },
      payload: { name: 'Hacked' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('404 missing category', async () => {
    const token = await registerAndLogin(app);
    const res = await app.inject({
      method: 'PUT',
      url: '/categories/000000000000000000000000',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'X' },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /categories/:id', () => {
  it('204 on successful delete', async () => {
    const token = await registerAndLogin(app);
    const createRes = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'To Delete' },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'DELETE',
      url: `/categories/${id}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(204);
  });

  it('403 wrong user', async () => {
    const token1 = await registerAndLogin(app, 'owner2@test.com');
    const token2 = await registerAndLogin(app, 'attacker2@test.com');

    const createRes = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token1}` },
      payload: { name: 'Owner Category' },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'DELETE',
      url: `/categories/${id}`,
      headers: { Authorization: `Bearer ${token2}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('404 missing category', async () => {
    const token = await registerAndLogin(app);
    const res = await app.inject({
      method: 'DELETE',
      url: '/categories/000000000000000000000000',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
