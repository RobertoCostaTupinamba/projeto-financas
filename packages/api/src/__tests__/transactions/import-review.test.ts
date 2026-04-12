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
import { TransactionModel } from '../../infrastructure/db/TransactionModel.js';

const TEST_MONGO_URI = 'mongodb://localhost:27017/financas_test';
const TEST_REDIS_URI = 'redis://localhost:6379';

const FAKE_ACCOUNT_ID = '222222222222222222222222';
const BOUNDARY = '----FormBoundaryReview1234';

let app: FastifyInstance;
let transactionRepo: MongoTransactionRepository;

beforeAll(async () => {
  await connectDB(TEST_MONGO_URI);
  connectRedis(TEST_REDIS_URI);
  const redis = getRedisClient();
  const userRepo = new MongoUserRepository();
  const accountRepo = new MongoAccountRepository();
  const categoryRepo = new MongoCategoryRepository();
  transactionRepo = new MongoTransactionRepository();
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
  await TransactionModel.deleteMany({});
  await redis.del('login:127.0.0.1');
  const keys = await redis.keys('refresh:*');
  if (keys.length) await redis.del(...keys);
});

async function registerAndLogin(email = 'review@test.com'): Promise<{ token: string; userId: string }> {
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
  const token = res.json().accessToken as string;
  const [, payloadB64] = token.split('.');
  const { sub: userId } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  return { token, userId };
}

function buildMultipartBody(accountId: string, csvContent: string): Buffer {
  const parts: string[] = [
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="accountId"\r\n\r\n${accountId}\r\n`,
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="nubank.csv"\r\nContent-Type: text/csv\r\n\r\n${csvContent}\r\n`,
  ];
  return Buffer.from(parts.join('') + `--${BOUNDARY}--\r\n`, 'utf-8');
}

/**
 * Fixture: 2 new + 1 duplicate (matched against a pre-existing confirmed tx) + 1 ignored
 */
const IMPORT_MONTH = '2026-04';
const FIXTURE_CSV = [
  'Data,Valor,Identificador,Descrição',
  '2026-04-10,-50.00,rev-001,Coffee',
  '2026-04-11,-30.00,rev-002,Lunch',
  '2026-04-15,-200.00,rev-003,Supermarket',
  'not-a-date,-10.00,rev-004,Bad Row',
].join('\n');

async function doImport(token: string, userId: string): Promise<{ sessionId: string; newIds: string[]; dupIds: string[] }> {
  // Pre-create a confirmed transaction that will be matched as a probable duplicate
  await transactionRepo.create({
    userId,
    accountId: FAKE_ACCOUNT_ID,
    amount: 20000,
    type: 'EXPENSE',
    date: new Date('2026-04-15'),
    description: 'Supermarket existing',
    status: 'confirmed',
  });

  const body = buildMultipartBody(FAKE_ACCOUNT_ID, FIXTURE_CSV);
  const res = await app.inject({
    method: 'POST',
    url: '/transactions/import',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    },
    body,
  });
  expect(res.statusCode).toBe(200);
  const json = res.json();
  return {
    sessionId: json.sessionId,
    newIds: (json.new as Array<{ id: string }>).map((t) => t.id),
    dupIds: (json.probableDuplicates as Array<{ id: string }>).map((t) => t.id),
  };
}

describe('GET /transactions/import/:sessionId', () => {
  it('returns correct bucket counts after upload', async () => {
    const { token, userId } = await registerAndLogin();
    const { sessionId } = await doImport(token, userId);

    const res = await app.inject({
      method: 'GET',
      url: `/transactions/import/${sessionId}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.sessionId).toBe(sessionId);
    expect(json.new).toHaveLength(2);
    expect(json.probableDuplicates).toHaveLength(1);
    expect(json.ignored).toHaveLength(0); // ignored rows are not saved to DB
  });

  it('returns empty buckets for unknown session', async () => {
    const { token } = await registerAndLogin('nodata@test.com');
    const res = await app.inject({
      method: 'GET',
      url: '/transactions/import/nonexistent-session-id',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.new).toHaveLength(0);
    expect(json.probableDuplicates).toHaveLength(0);
    expect(json.ignored).toHaveLength(0);
  });

  it('401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/transactions/import/any-session' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /transactions/import/:sessionId/confirm', () => {
  it('accept-all-new + reject-duplicate: accepted are confirmed, rejected are deleted', async () => {
    const { token, userId } = await registerAndLogin('confirm@test.com');
    const { sessionId, newIds, dupIds } = await doImport(token, userId);

    const decisions = [
      ...newIds.map((id) => ({ transactionId: id, action: 'accept' as const })),
      ...dupIds.map((id) => ({ transactionId: id, action: 'reject' as const })),
    ];

    const res = await app.inject({
      method: 'POST',
      url: `/transactions/import/${sessionId}/confirm`,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { decisions },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.accepted).toHaveLength(2);
    expect(json.rejected).toBe(1);

    // Accepted transactions must be confirmed in MongoDB
    for (const tx of json.accepted as Array<{ id: string; status: string }>) {
      const dbTx = await TransactionModel.findById(tx.id);
      expect(dbTx).not.toBeNull();
      expect(dbTx!.status).toBe('confirmed');
    }

    // Rejected must be deleted from MongoDB
    for (const id of dupIds) {
      const dbTx = await TransactionModel.findById(id);
      expect(dbTx).toBeNull();
    }
  });

  it('undecided pending_review rows are cleaned up automatically', async () => {
    const { token, userId } = await registerAndLogin('cleanup@test.com');
    const { sessionId, newIds } = await doImport(token, userId);

    // Only accept the first new transaction, leave the rest undecided
    const decisions = [{ transactionId: newIds[0], action: 'accept' as const }];

    const res = await app.inject({
      method: 'POST',
      url: `/transactions/import/${sessionId}/confirm`,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { decisions },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.accepted).toHaveLength(1);
    // cleaned should be > 0 for the undecided rows
    expect(json.cleaned).toBeGreaterThan(0);

    // No pending_review transactions should remain for this session
    const remaining = await TransactionModel.find({ importSessionId: sessionId, status: 'pending_review' });
    expect(remaining).toHaveLength(0);
  });

  it('summary after confirm only counts confirmed transactions', async () => {
    const { token, userId } = await registerAndLogin('summary@test.com');
    const { sessionId, newIds, dupIds } = await doImport(token, userId);

    const decisions = [
      ...newIds.map((id) => ({ transactionId: id, action: 'accept' as const })),
      ...dupIds.map((id) => ({ transactionId: id, action: 'reject' as const })),
    ];

    await app.inject({
      method: 'POST',
      url: `/transactions/import/${sessionId}/confirm`,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { decisions },
    });

    const summaryRes = await app.inject({
      method: 'GET',
      url: `/transactions/summary?month=${IMPORT_MONTH}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json() as Record<string, number>;
    const total = Object.values(summary).reduce((a, b) => a + b, 0);

    // pre-existing confirmed (20000) + 2 accepted new (5000 + 3000 = 8000) = 28000
    expect(total).toBe(28000);
  });

  it('400 when decisions is missing', async () => {
    const { token, userId } = await registerAndLogin('bad@test.com');
    const { sessionId } = await doImport(token, userId);

    const res = await app.inject({
      method: 'POST',
      url: `/transactions/import/${sessionId}/confirm`,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/transactions/import/any-session/confirm',
      headers: { 'content-type': 'application/json' },
      payload: { decisions: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /transactions/import/:sessionId', () => {
  it('cancels import and deletes all pending_review rows in session', async () => {
    const { token, userId } = await registerAndLogin('cancel@test.com');
    const { sessionId } = await doImport(token, userId);

    const res = await app.inject({
      method: 'DELETE',
      url: `/transactions/import/${sessionId}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(204);

    const remaining = await TransactionModel.find({ importSessionId: sessionId });
    expect(remaining).toHaveLength(0);
  });

  it('401 without token', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/transactions/import/any-session' });
    expect(res.statusCode).toBe(401);
  });
});
