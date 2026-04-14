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
import { MerchantRuleModel } from '../../infrastructure/db/MerchantRuleModel.js';

const TEST_MONGO_URI = 'mongodb://localhost:27017/financas_test';
const TEST_REDIS_URI = 'redis://localhost:6379';

const FAKE_ACCOUNT_ID = '111111111111111111111111';
const BOUNDARY = '----FormBoundary7MA4YWxkTrZu0gW';

let app: FastifyInstance;
let transactionRepo: MongoTransactionRepository;
let merchantRuleRepo: MongoMerchantRuleRepository;

beforeAll(async () => {
  await connectDB(TEST_MONGO_URI);
  connectRedis(TEST_REDIS_URI);
  const redis = getRedisClient();
  const userRepo = new MongoUserRepository();
  const accountRepo = new MongoAccountRepository();
  const categoryRepo = new MongoCategoryRepository();
  transactionRepo = new MongoTransactionRepository();
  merchantRuleRepo = new MongoMerchantRuleRepository();
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
  await MerchantRuleModel.deleteMany({});
  await redis.del('login:127.0.0.1');
  const keys = await redis.keys('refresh:*');
  if (keys.length) {
    await redis.del(...keys);
  }
});

async function registerAndLogin(email = 'import@test.com'): Promise<{ token: string; userId: string }> {
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
    const { token } = await registerAndLogin();

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
    const { token, userId } = await registerAndLogin();

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
    expect(Array.isArray(json.partialMatchSuggestions)).toBe(true);

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

describe('Merchant-rule integration in import pipeline', () => {
  it('exact-match rule pre-categorizes imported transaction', async () => {
    const { token, userId } = await registerAndLogin('exact@test.com');

    // Create a category to use
    const catRes = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { name: 'Transporte' },
    });
    expect(catRes.statusCode).toBe(201);
    const transportId = catRes.json().id as string;

    // Create an exact merchant rule for 'UBER EATS'
    await merchantRuleRepo.create({
      userId,
      pattern: 'uber eats',
      categoryId: transportId,
      matchType: 'exact',
    });

    // Import a CSV with 'UBER EATS' description
    const csv = [
      'Data,Valor,Identificador,Descrição',
      '2026-04-10,-50.00,ue-001,UBER EATS',
    ].join('\n');

    const body = buildMultipartBody(FAKE_ACCOUNT_ID, csv);
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
    expect(json.new).toHaveLength(1);
    // The transaction should have the categoryId pre-assigned
    expect(json.new[0].categoryId).toBe(transportId);
    expect(json.partialMatchSuggestions).toHaveLength(0);
  });

  it('partial-match rule surfaces a suggestion in partialMatchSuggestions', async () => {
    const { token, userId } = await registerAndLogin('partial@test.com');

    // Create a category
    const catRes = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { name: 'Transporte' },
    });
    expect(catRes.statusCode).toBe(201);
    const transportId = catRes.json().id as string;

    // Create an exact merchant rule for 'uber eats'
    const rule = await merchantRuleRepo.create({
      userId,
      pattern: 'uber eats',
      categoryId: transportId,
      matchType: 'exact',
    });

    // Import with a fuzzy description 'UBER *EATS BR' that doesn't exact-match but should partial-match
    const csv = [
      'Data,Valor,Identificador,Descrição',
      '2026-04-10,-50.00,ue-002,UBER *EATS BR',
    ].join('\n');

    const body = buildMultipartBody(FAKE_ACCOUNT_ID, csv);
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
    expect(json.new).toHaveLength(1);
    // No exact match → no categoryId pre-assigned
    expect(json.new[0].categoryId).toBeUndefined();
    // Partial match suggestion must be present
    expect(json.partialMatchSuggestions).toHaveLength(1);
    const suggestion = json.partialMatchSuggestions[0];
    expect(suggestion.ruleId).toBe(rule.id);
    expect(suggestion.suggestedCategoryId).toBe(transportId);
    expect(suggestion.transactionId).toBe(json.new[0].id);
  });

  it('confirm with saveRule=true creates a new merchant rule', async () => {
    const { token, userId } = await registerAndLogin('saverule@test.com');

    // Create a category
    const catRes = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { name: 'Assinaturas' },
    });
    const subscriptionId = catRes.json().id as string;

    // Import a transaction
    const csv = [
      'Data,Valor,Identificador,Descrição',
      '2026-04-10,-39.90,ap-001,AMAZON PRIME',
    ].join('\n');

    const body = buildMultipartBody(FAKE_ACCOUNT_ID, csv);
    const importRes = await app.inject({
      method: 'POST',
      url: '/transactions/import',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      },
      body,
    });
    expect(importRes.statusCode).toBe(200);
    const { sessionId, new: newTxs } = importRes.json();
    const txId = newTxs[0].id as string;

    // Confirm with saveRule=true
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/transactions/import/${sessionId}/confirm`,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: {
        decisions: [{
          transactionId: txId,
          action: 'accept',
          categoryId: subscriptionId,
          saveRule: true,
          merchantPattern: 'amazon prime',
        }],
      },
    });
    expect(confirmRes.statusCode).toBe(200);

    // GET /merchant-rules should now show the new rule
    const rulesRes = await app.inject({
      method: 'GET',
      url: '/merchant-rules',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(rulesRes.statusCode).toBe(200);
    const rules = rulesRes.json() as Array<{ pattern: string; categoryId: string; matchType: string }>;
    expect(rules.length).toBeGreaterThan(0);
    const savedRule = rules.find((r) => r.pattern === 'amazon prime');
    expect(savedRule).toBeDefined();
    expect(savedRule!.categoryId).toBe(subscriptionId);
    expect(savedRule!.matchType).toBe('exact');
  });

  it('confirm with acceptRuleSuggestion=true creates a confirmed_partial rule', async () => {
    const { token, userId } = await registerAndLogin('partialaccept@test.com');

    // Create a category
    const catRes = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { name: 'Streaming' },
    });
    const streamingId = catRes.json().id as string;

    // Import a transaction
    const csv = [
      'Data,Valor,Identificador,Descrição',
      '2026-04-10,-55.90,nf-001,NETFLIX BR',
    ].join('\n');

    const body = buildMultipartBody(FAKE_ACCOUNT_ID, csv);
    const importRes = await app.inject({
      method: 'POST',
      url: '/transactions/import',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      },
      body,
    });
    expect(importRes.statusCode).toBe(200);
    const { sessionId, new: newTxs } = importRes.json();
    const txId = newTxs[0].id as string;

    // Confirm accepting a partial-match rule suggestion
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/transactions/import/${sessionId}/confirm`,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: {
        decisions: [{
          transactionId: txId,
          action: 'accept',
          acceptRuleSuggestion: true,
          ruleSuggestion: { merchantPattern: 'netflix br', categoryId: streamingId },
        }],
      },
    });
    expect(confirmRes.statusCode).toBe(200);

    // Verify confirmed_partial rule was created in DB
    const rules = await merchantRuleRepo.findByUserId(userId);
    const partialRule = rules.find((r) => r.pattern === 'netflix br');
    expect(partialRule).toBeDefined();
    expect(partialRule!.matchType).toBe('confirmed_partial');
    expect(partialRule!.categoryId).toBe(streamingId);
  });
});
