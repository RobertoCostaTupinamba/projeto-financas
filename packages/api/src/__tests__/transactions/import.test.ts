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

const FAKE_ACCOUNT_ID = '111111111111111111111111';
const BOUNDARY = '----FormBoundary7MA4YWxkTrZu0gW';

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
  if (keys.length) {
    await redis.del(...keys);
  }
});

async function registerAndLogin(email = 'import@test.com'): Promise<string> {
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

/**
 * Build a raw multipart/form-data body with:
 * - a text field (accountId)
 * - a file field (file) containing the CSV text
 */
function buildMultipartBody(accountId: string, csvContent: string): Buffer {
  const parts: string[] = [];

  // accountId field
  parts.push(
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="accountId"\r\n` +
    `\r\n` +
    `${accountId}\r\n`,
  );

  // file field
  parts.push(
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="nubank.csv"\r\n` +
    `Content-Type: text/csv\r\n` +
    `\r\n` +
    `${csvContent}\r\n`,
  );

  const body = parts.join('') + `--${BOUNDARY}--\r\n`;
  return Buffer.from(body, 'utf-8');
}

/**
 * Fixture CSV:
 * - Row 1: valid EXPENSE 2026-04-10 → will be "new"
 * - Row 2: valid EXPENSE 2026-04-11 → will be "new"
 * - Row 3: valid EXPENSE 2026-04-15 → will match pre-created confirmed tx → probableDuplicate
 * - Row 4: invalid date → ignored
 */
const IMPORT_MONTH = '2026-04';
const FIXTURE_CSV = [
  'Data,Valor,Identificador,Descrição',
  '2026-04-10,-50.00,ext-001,Coffee',
  '2026-04-11,-30.00,ext-002,Lunch',
  '2026-04-15,-200.00,ext-003,Supermarket',
  'not-a-date,-10.00,ext-004,Bad Row',
].join('\n');

describe('POST /transactions/import', () => {
  it('401 without Bearer token', async () => {
    const body = buildMultipartBody(FAKE_ACCOUNT_ID, FIXTURE_CSV);
    const res = await app.inject({
      method: 'POST',
      url: '/transactions/import',
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      body,
    });
    expect(res.statusCode).toBe(401);
  });

  it('400 when accountId field is missing', async () => {
    const token = await registerAndLogin();

    // Build multipart with only the file, no accountId field
    const csvContent = FIXTURE_CSV;
    const rawBody =
      `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="nubank.csv"\r\n` +
      `Content-Type: text/csv\r\n` +
      `\r\n` +
      `${csvContent}\r\n` +
      `--${BOUNDARY}--\r\n`;

    const res = await app.inject({
      method: 'POST',
      url: '/transactions/import',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      },
      body: Buffer.from(rawBody, 'utf-8'),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/accountId/i);
  });

  it('200 with correct shape and MongoDB state + summary regression', async () => {
    const token = await registerAndLogin();

    // Decode userId from JWT to create a pre-existing confirmed transaction
    const [, payloadB64] = token.split('.');
    const { sub: userId } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Pre-create a confirmed transaction matching row 3 (2026-04-15, 20000 centavos)
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

    // Verify response shape
    expect(typeof json.sessionId).toBe('string');
    expect(json.sessionId.length).toBeGreaterThan(0);
    expect(Array.isArray(json.new)).toBe(true);
    expect(Array.isArray(json.probableDuplicates)).toBe(true);
    expect(Array.isArray(json.ignored)).toBe(true);

    // 2 new, 1 probable duplicate, 1 ignored
    expect(json.new).toHaveLength(2);
    expect(json.probableDuplicates).toHaveLength(1);
    expect(json.ignored).toHaveLength(1);

    // All imported transactions are pending_review with the right sessionId
    const sessionId = json.sessionId;
    const imported = await TransactionModel.find({ importSessionId: sessionId });
    expect(imported).toHaveLength(3); // 2 new + 1 probableDuplicate
    for (const tx of imported) {
      expect(tx.status).toBe('pending_review');
    }

    // Summary regression: pending_review transactions must not affect summary totals
    const summaryRes = await app.inject({
      method: 'GET',
      url: `/transactions/summary?month=${IMPORT_MONTH}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json() as Record<string, number>;

    // The only confirmed transaction has no category → shows as "Uncategorized"
    // pending_review transactions must contribute 0 to total
    const pendingTotal = (json.new as Array<{ amount: number }>)
      .concat(json.probableDuplicates as Array<{ amount: number }>)
      .reduce((sum, t) => sum + t.amount, 0);
    const summaryTotal = Object.values(summary).reduce((a, b) => a + b, 0);

    // summaryTotal should only reflect the confirmed transaction (20000), not pending_review
    expect(summaryTotal).toBe(20000);
    // And the pending imports must not inflate the total
    expect(summaryTotal).not.toBe(summaryTotal + pendingTotal);
  });
});
