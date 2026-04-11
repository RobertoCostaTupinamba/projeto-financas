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
  await disconnectRedis(); // quit() + null the singleton — prevents Vitest from hanging
});

beforeEach(async () => {
  const redis = getRedisClient();
  // Clear all users between tests
  await UserModel.deleteMany({});
  // Clear rate-limit key (inject() defaults to 127.0.0.1)
  await redis.del('login:127.0.0.1');
  // Clear any leftover refresh tokens
  const keys = await redis.keys('refresh:*');
  if (keys.length) {
    await redis.del(...keys);
  }
});

/** Extract the refreshToken value from a Set-Cookie header */
function extractRefreshToken(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie ?? '';
  const match = raw.match(/refreshToken=([^;]+)/);
  if (!match || !match[1]) {
    throw new Error(`Could not extract refreshToken from Set-Cookie: ${raw}`);
  }
  return match[1];
}

describe('POST /auth/register', () => {
  it('returns 201 with id and email, no passwordHash', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'a@b.com', password: 'pass123' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('email', 'a@b.com');
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('returns 409 on duplicate email', async () => {
    const payload = { email: 'dup@b.com', password: 'pass123' };
    await app.inject({ method: 'POST', url: '/auth/register', payload });
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload });

    expect(res.statusCode).toBe(409);
  });
});

describe('POST /auth/login', () => {
  it('returns 200, accessToken in body, and refreshToken cookie', async () => {
    // Register first
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'login@b.com', password: 'pass123' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'login@b.com', password: 'pass123' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.length).toBeGreaterThan(0);

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const token = extractRefreshToken(setCookie);
    expect(token.length).toBeGreaterThan(0);
  });

  it('returns 401 with wrong password', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'wrong@b.com', password: 'pass123' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'wrong@b.com', password: 'badpassword' },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates token: new accessToken on valid cookie, 401 on replayed old cookie', async () => {
    // Register + login
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'refresh@b.com', password: 'pass123' },
    });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'refresh@b.com', password: 'pass123' },
    });

    const originalToken = extractRefreshToken(loginRes.headers['set-cookie']);

    // First refresh — should succeed
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: `refreshToken=${originalToken}` },
    });

    expect(refreshRes.statusCode).toBe(200);
    const body = refreshRes.json();
    expect(typeof body.accessToken).toBe('string');

    const newToken = extractRefreshToken(refreshRes.headers['set-cookie']);
    expect(newToken).not.toBe(originalToken);

    // Replay the original (already consumed by GETDEL) — must fail
    const replayRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: `refreshToken=${originalToken}` },
    });

    expect(replayRes.statusCode).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('returns 204 and subsequent refresh returns 401', async () => {
    // Register + login
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'logout@b.com', password: 'pass123' },
    });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'logout@b.com', password: 'pass123' },
    });

    const token = extractRefreshToken(loginRes.headers['set-cookie']);

    // Logout
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: `refreshToken=${token}` },
    });

    expect(logoutRes.statusCode).toBe(204);

    // Try to refresh with the now-invalidated token
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: `refreshToken=${token}` },
    });

    expect(refreshRes.statusCode).toBe(401);
  });
});

describe('Rate limiting on POST /auth/login', () => {
  it('returns 429 on the 6th attempt', async () => {
    const payload = { email: 'rate@b.com', password: 'wrongpass' };

    let lastRes: Awaited<ReturnType<typeof app.inject>> | null = null;
    for (let i = 0; i < 6; i++) {
      lastRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload,
      });
    }

    expect(lastRes!.statusCode).toBe(429);
    expect(lastRes!.headers['retry-after']).toBeDefined();
  });
});
