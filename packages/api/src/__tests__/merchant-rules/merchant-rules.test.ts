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
import { MongoMerchantRuleRepository } from '../../infrastructure/repositories/MongoMerchantRuleRepository.js';
import { UserModel } from '../../infrastructure/db/UserModel.js';
import { MerchantRuleModel } from '../../infrastructure/db/MerchantRuleModel.js';

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
  const merchantRuleRepo = new MongoMerchantRuleRepository();
  app = await buildServer();
  await registerRoutes(app, { userRepo, redis, accountRepo, categoryRepo, transactionRepo, merchantRuleRepo });
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
  await MerchantRuleModel.deleteMany({});
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

describe('POST /merchant-rules', () => {
  it('401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/merchant-rules',
      payload: { merchantPattern: 'UBER EATS', categoryId: 'cat1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('201 creates rule with expected fields', async () => {
    const token = await registerAndLogin(app);
    const res = await app.inject({
      method: 'POST',
      url: '/merchant-rules',
      headers: { Authorization: `Bearer ${token}` },
      payload: { merchantPattern: 'UBER EATS', categoryId: 'cat-transport' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('merchantPattern' in body ? 'merchantPattern' : 'pattern');
    expect(body).toHaveProperty('categoryId', 'cat-transport');
    expect(body).toHaveProperty('matchType');
  });
});

describe('GET /merchant-rules', () => {
  it('401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/merchant-rules' });
    expect(res.statusCode).toBe(401);
  });

  it('200 returns array containing the created rule', async () => {
    const token = await registerAndLogin(app);
    await app.inject({
      method: 'POST',
      url: '/merchant-rules',
      headers: { Authorization: `Bearer ${token}` },
      payload: { merchantPattern: 'IFOOD', categoryId: 'cat-food' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/merchant-rules',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const rules = res.json();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThanOrEqual(1);
    expect(rules[0]).toHaveProperty('id');
    expect(rules[0]).toHaveProperty('categoryId', 'cat-food');
  });
});

describe('DELETE /merchant-rules/:id', () => {
  it('401 without token', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/merchant-rules/000000000000000000000000',
    });
    expect(res.statusCode).toBe(401);
  });

  it('204 deletes rule; subsequent GET returns empty array', async () => {
    const token = await registerAndLogin(app);
    const createRes = await app.inject({
      method: 'POST',
      url: '/merchant-rules',
      headers: { Authorization: `Bearer ${token}` },
      payload: { merchantPattern: 'MERCADOPAGO', categoryId: 'cat-misc' },
    });
    const { id } = createRes.json();

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/merchant-rules/${id}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: 'GET',
      url: '/merchant-rules',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getRes.json()).toHaveLength(0);
  });

  it('403 when deleting another user\'s rule', async () => {
    const ownerToken = await registerAndLogin(app, 'owner@test.com');
    const attackerToken = await registerAndLogin(app, 'attacker@test.com');

    const createRes = await app.inject({
      method: 'POST',
      url: '/merchant-rules',
      headers: { Authorization: `Bearer ${ownerToken}` },
      payload: { merchantPattern: 'NETFLIX', categoryId: 'cat-streaming' },
    });
    const { id } = createRes.json();

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/merchant-rules/${id}`,
      headers: { Authorization: `Bearer ${attackerToken}` },
    });
    expect(delRes.statusCode).toBe(403);
  });

  it('404 when rule does not exist', async () => {
    const token = await registerAndLogin(app);
    const res = await app.inject({
      method: 'DELETE',
      url: '/merchant-rules/000000000000000000000000',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
