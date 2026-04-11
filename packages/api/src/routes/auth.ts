import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { IUserRepository } from '@financas/shared';
import { RegisterUseCase } from '../use-cases/auth/RegisterUseCase.js';
import { LoginUseCase } from '../use-cases/auth/LoginUseCase.js';
import { RefreshUseCase } from '../use-cases/auth/RefreshUseCase.js';
import { LogoutUseCase } from '../use-cases/auth/LogoutUseCase.js';

interface AuthRouteOptions {
  userRepo: IUserRepository;
  redis: Redis;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  path: '/',
  maxAge: 604800, // 7 days in seconds
} as const;

export default async function authRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions,
): Promise<void> {
  const { userRepo, redis } = options;

  const register = new RegisterUseCase(userRepo);
  const login = new LoginUseCase(userRepo, redis);
  const refresh = new RefreshUseCase(redis, userRepo);
  const logout = new LogoutUseCase(redis);

  // POST /auth/register
  app.post<{ Body: { email: string; password: string } }>(
    '/auth/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      try {
        const result = await register.execute(email, password);
        return reply.code(201).send(result);
      } catch (err: any) {
        if (err?.code === 'EMAIL_EXISTS') {
          return reply.code(409).send({ error: 'Email already registered' });
        }
        throw err;
      }
    },
  );

  // POST /auth/login (IP-based rate limiting: 5 attempts per 15 min)
  app.post<{ Body: { email: string; password: string } }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const rateLimitKey = `login:${request.ip}`;
      try {
        const count = await redis.incr(rateLimitKey);
        // Set expiry only on first INCR — subsequent INCRs must not reset the window
        if (count === 1) {
          await redis.expire(rateLimitKey, 900); // 15 minutes
        }
        if (count > 5) {
          return reply
            .code(429)
            .header('Retry-After', '900')
            .send({ error: 'Too many attempts', retryAfter: 900 });
        }
      } catch (redisErr) {
        // Fail open — rate limit is advisory for personal app
        request.log.warn({ err: redisErr }, 'Redis rate-limit check failed; allowing request');
      }

      const { email, password } = request.body;
      try {
        const { accessToken, refreshToken } = await login.execute(email, password);
        reply.setCookie('refreshToken', refreshToken, COOKIE_OPTIONS);
        return reply.send({ accessToken });
      } catch (err: any) {
        if (err?.code === 'INVALID_CREDENTIALS') {
          return reply.code(401).send({ error: 'Invalid credentials' });
        }
        throw err;
      }
    },
  );

  // POST /auth/refresh
  app.post('/auth/refresh', async (request, reply) => {
    const token = request.cookies['refreshToken'];
    if (!token) {
      return reply.code(401).send({ error: 'Missing refresh token' });
    }
    try {
      const { accessToken, refreshToken: newRefreshToken } = await refresh.execute(token);
      reply.setCookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);
      return reply.send({ accessToken });
    } catch (err: any) {
      if (err?.code === 'INVALID_REFRESH_TOKEN') {
        return reply.code(401).send({ error: 'Invalid or expired refresh token' });
      }
      throw err;
    }
  });

  // POST /auth/logout
  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies['refreshToken'];
    // LogoutUseCase is a no-op on undefined/empty — graceful
    await logout.execute(token);
    reply.clearCookie('refreshToken', { path: '/' });
    return reply.code(204).send();
  });
}
