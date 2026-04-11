import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../server.js';
import { registerRoutes } from '../../app.js';
import { connectDB, disconnectDB } from '../../infrastructure/db/connection.js';
import { connectRedis, disconnectRedis, getRedisClient } from '../../infrastructure/redis/client.js';
import { MongoUserRepository } from '../../infrastructure/repositories/MongoUserRepository.js';
import { MongoAccountRepository } from '../../infrastructure/repositories/MongoAccountRepository.js';
import { MongoCategoryRepository } from '../../infrastructure/repositories/MongoCategoryRepository.js';
import { MongoTransactionRepository } from '../../infrastructure/repositories/MongoTransactionRepository.js';
import { UserModel } from '../../infrastructure/db/UserModel.js';
import { AccountModel } from '../../infrastructure/db/AccountModel.js';

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
  const transactionRepo = new MongoTransactionRepository();
  app = await buildServer();
  await registerRoutes(app, { userRepo, redis, accountRepo, categoryRepo, transactionRepo });
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
  await AccountModel.deleteMany({});
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

describe('POST /accounts', () => {
  it('201 with CHECKING type (no closingDay/dueDay)', async () => {
    const token = await registerAndLogin(app);
    const res = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'Nubank', type: 'CHECKING' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty('id');
    expect(body.name).toBe('Nubank');
    expect(body.type).toBe('CHECKING');
    expect(body.closingDay).toBeUndefined();
    expect(body.dueDay).toBeUndefined();
  });

  it('201 with CREDIT_CARD type (closingDay: 15, dueDay: 22)', async () => {
    const token = await registerAndLogin(app);
    const res = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'Nubank Crédito', type: 'CREDIT_CARD', closingDay: 15, dueDay: 22 },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.type).toBe('CREDIT_CARD');
    expect(body.closingDay).toBe(15);
    expect(body.dueDay).toBe(22);
  });

  it('401 without Bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/accounts',
      payload: { name: 'Nubank', type: 'CHECKING' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('GET /accounts', () => {
  it('returns only current user\'s accounts (ownership isolation)', async () => {
    const token1 = await registerAndLogin(app, 'user1@test.com');
    const token2 = await registerAndLogin(app, 'user2@test.com');

    // Create account for user1
    await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { Authorization: `Bearer ${token1}` },
      payload: { name: 'User1 Account', type: 'CHECKING' },
    });

    // Create account for user2
    await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { Authorization: `Bearer ${token2}` },
      payload: { name: 'User2 Account', type: 'SAVINGS' },
    });

    // user1 should only see their own account
    const res = await app.inject({
      method: 'GET',
      url: '/accounts',
      headers: { Authorization: `Bearer ${token1}` },
    });

    expect(res.statusCode).toBe(200);
    const accounts = res.json();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe('User1 Account');
  });

  it('401 without Bearer token', async () => {
    const res = await app.inject({ method: 'GET', url: '/accounts' });

    expect(res.statusCode).toBe(401);
  });
});

describe('PUT /accounts/:id', () => {
  it('200 with name change', async () => {
    const token = await registerAndLogin(app);
    const createRes = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'Original', type: 'CHECKING' },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'PUT',
      url: `/accounts/${id}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Updated');
  });

  it('403 when authenticated as a different user', async () => {
    const token1 = await registerAndLogin(app, 'owner@test.com');
    const token2 = await registerAndLogin(app, 'attacker@test.com');

    const createRes = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { Authorization: `Bearer ${token1}` },
      payload: { name: 'Owner Account', type: 'CHECKING' },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'PUT',
      url: `/accounts/${id}`,
      headers: { Authorization: `Bearer ${token2}` },
      payload: { name: 'Hacked' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('404 on non-existent id', async () => {
    const token = await registerAndLogin(app);
    const res = await app.inject({
      method: 'PUT',
      url: '/accounts/000000000000000000000000',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'X' },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /accounts/:id', () => {
  it('204 on successful delete', async () => {
    const token = await registerAndLogin(app);
    const createRes = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'To Delete', type: 'CHECKING' },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'DELETE',
      url: `/accounts/${id}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(204);
  });

  it('403 when authenticated as a different user', async () => {
    const token1 = await registerAndLogin(app, 'owner2@test.com');
    const token2 = await registerAndLogin(app, 'attacker2@test.com');

    const createRes = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { Authorization: `Bearer ${token1}` },
      payload: { name: 'Owner Account', type: 'CHECKING' },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'DELETE',
      url: `/accounts/${id}`,
      headers: { Authorization: `Bearer ${token2}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('404 on non-existent id', async () => {
    const token = await registerAndLogin(app);
    const res = await app.inject({
      method: 'DELETE',
      url: '/accounts/000000000000000000000000',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
