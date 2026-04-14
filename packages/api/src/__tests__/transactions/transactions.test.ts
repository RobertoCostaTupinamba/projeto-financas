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
import { TransactionModel } from '../../infrastructure/db/TransactionModel.js';
import { CategoryModel } from '../../infrastructure/db/CategoryModel.js';

const TEST_MONGO_URI = 'mongodb://localhost:27017/financas_test';
const TEST_REDIS_URI = 'redis://localhost:6379';

// A valid 24-char hex string used as a placeholder accountId
// (use-cases do not validate account existence)
const FAKE_ACCOUNT_ID = '111111111111111111111111';

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
  await TransactionModel.deleteMany({});
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

// Helper: create a transaction and return the parsed body
async function createTransaction(
  token: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await app.inject({
    method: 'POST',
    url: '/transactions',
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      accountId: FAKE_ACCOUNT_ID,
      amount: 5000,
      type: 'EXPENSE',
      date: '2026-04-15',
      ...overrides,
    },
  });
  return res;
}

describe('POST /transactions', () => {
  it('201 with id, amount and type=EXPENSE', async () => {
    const token = await registerAndLogin(app);
    const res = await createTransaction(token);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty('id');
    expect(body.amount).toBe(5000);
    expect(body.type).toBe('EXPENSE');
  });

  it('401 without Bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/transactions',
      payload: { accountId: FAKE_ACCOUNT_ID, amount: 5000, type: 'EXPENSE', date: '2026-04-15' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('GET /transactions', () => {
  it('200 with ?month=2026-04 contains the created transaction', async () => {
    const token = await registerAndLogin(app);
    await createTransaction(token, { date: '2026-04-15' });

    const res = await app.inject({
      method: 'GET',
      url: '/transactions?month=2026-04',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].amount).toBe(5000);
  });

  it('200 without month returns all transactions', async () => {
    const token = await registerAndLogin(app);
    await createTransaction(token, { date: '2026-04-15' });
    await createTransaction(token, { date: '2026-05-01' });

    const res = await app.inject({
      method: 'GET',
      url: '/transactions',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  it('400 with ?month=invalid', async () => {
    const token = await registerAndLogin(app);

    const res = await app.inject({
      method: 'GET',
      url: '/transactions?month=invalid',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
  });

  it('month boundary: 2026-04-15 appears in month=2026-04, 2026-05-10 does not', async () => {
    const token = await registerAndLogin(app);
    await createTransaction(token, { date: '2026-04-15', description: 'april-tx' });
    await createTransaction(token, { date: '2026-05-10', description: 'may-tx' });

    const res = await app.inject({
      method: 'GET',
      url: '/transactions?month=2026-04',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Only the April transaction should be returned
    expect(body).toHaveLength(1);
    expect(body[0].description).toBe('april-tx');
  });
});

describe('GET /transactions/summary', () => {
  it('200 returns { Alimentação: 5000 } for EXPENSE with category', async () => {
    const token = await registerAndLogin(app);

    // Create a category
    const catRes = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'Alimentação' },
    });
    expect(catRes.statusCode).toBe(201);
    const categoryId = catRes.json().id as string;

    // Create EXPENSE transaction with that category
    await createTransaction(token, { categoryId, date: '2026-04-15' });

    const res = await app.inject({
      method: 'GET',
      url: '/transactions/summary?month=2026-04',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const summary = res.json();
    expect(summary['Alimentação']).toBe(5000);
  });

  it('200 EXPENSE only: INCOME transactions are excluded from summary', async () => {
    const token = await registerAndLogin(app);

    const catRes = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'Salário' },
    });
    const categoryId = catRes.json().id as string;

    // Create INCOME transaction
    await createTransaction(token, { type: 'INCOME', amount: 100000, categoryId, date: '2026-04-10' });
    // Create EXPENSE transaction (no category → 'Uncategorized')
    await createTransaction(token, { type: 'EXPENSE', amount: 3000, date: '2026-04-15' });

    const res = await app.inject({
      method: 'GET',
      url: '/transactions/summary?month=2026-04',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const summary = res.json();
    // INCOME category should not appear as a spending category
    expect(summary['Salário']).toBeUndefined();
    // EXPENSE without category → Uncategorized
    expect(summary['Uncategorized']).toBe(3000);
  });
});

describe('GET /transactions/summary — pending_review exclusion', () => {
  it('pending_review transaction is excluded from summary totals', async () => {
    const token = await registerAndLogin(app);

    // Create a confirmed EXPENSE via the HTTP route (should appear in summary)
    const catRes = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'Confirmed' },
    });
    const categoryId = catRes.json().id as string;
    await createTransaction(token, { categoryId, amount: 3000, date: '2026-04-15' });

    // Decode userId from the JWT to create a repo-level pending_review transaction
    const [, payloadB64] = token.split('.');
    const { sub: userId } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    const transactionRepo = new MongoTransactionRepository();
    await transactionRepo.create({
      userId,
      accountId: FAKE_ACCOUNT_ID,
      amount: 9999,
      type: 'EXPENSE',
      date: new Date('2026-04-20'),
      status: 'pending_review',
      importSessionId: 'test-session-001',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/transactions/summary?month=2026-04',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const summary = res.json();
    // The confirmed transaction should appear
    expect(summary['Confirmed']).toBe(3000);
    // The pending_review transaction (9999) must NOT contribute to any total
    const total = Object.values(summary as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(total).toBe(3000);
  });
});

describe('PUT /transactions/:id', () => {
  it('200 updated fields reflected in response', async () => {
    const token = await registerAndLogin(app);
    const createRes = await createTransaction(token);
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'PUT',
      url: `/transactions/${id}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { amount: 9900, description: 'Updated description' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.amount).toBe(9900);
    expect(body.description).toBe('Updated description');
  });

  it('403 when authenticated as a different user', async () => {
    const tokenA = await registerAndLogin(app, 'userA@test.com');
    const tokenB = await registerAndLogin(app, 'userB@test.com');

    const createRes = await createTransaction(tokenA);
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'PUT',
      url: `/transactions/${id}`,
      headers: { Authorization: `Bearer ${tokenB}` },
      payload: { amount: 1 },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE /transactions/:id', () => {
  it('204 on successful delete', async () => {
    const token = await registerAndLogin(app);
    const createRes = await createTransaction(token);
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'DELETE',
      url: `/transactions/${id}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(204);
  });

  it('403 when authenticated as a different user', async () => {
    const tokenA = await registerAndLogin(app, 'ownerTx@test.com');
    const tokenB = await registerAndLogin(app, 'attackerTx@test.com');

    const createRes = await createTransaction(tokenA);
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'DELETE',
      url: `/transactions/${id}`,
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
