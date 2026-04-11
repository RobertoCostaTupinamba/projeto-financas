import { describe, it, expect, vi } from 'vitest';
import { RefreshUseCase } from '../../../use-cases/auth/RefreshUseCase.js';
import type { IUserRepository, User } from '@financas/shared';
import type { Redis } from 'ioredis';

const user: User = {
  id: 'user-1',
  email: 'a@test.com',
  passwordHash: '$hash',
  createdAt: new Date('2026-01-01'),
};

const makeRepo = (found: User | null): IUserRepository => ({
  create: vi.fn(),
  findByEmail: vi.fn(async () => null),
  findById: vi.fn(async () => found),
});

const makeRedis = (userId: string | null): Redis =>
  ({ getdel: vi.fn(async () => userId), set: vi.fn(async () => 'OK') } as unknown as Redis);

describe('RefreshUseCase', () => {
  it('rotates tokens and returns new accessToken + refreshToken', async () => {
    const redis = makeRedis(user.id);
    const useCase = new RefreshUseCase(redis, makeRepo(user));

    const result = await useCase.execute('old-token');

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.refreshToken).not.toBe('old-token'); // token was rotated
    expect(redis.getdel).toHaveBeenCalledWith('refresh:old-token');
  });

  it('throws INVALID_REFRESH_TOKEN when token not found in Redis', async () => {
    const useCase = new RefreshUseCase(makeRedis(null), makeRepo(user));

    await expect(useCase.execute('expired-token')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws INVALID_REFRESH_TOKEN when user no longer exists', async () => {
    const useCase = new RefreshUseCase(makeRedis(user.id), makeRepo(null));

    await expect(useCase.execute('valid-redis-token')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('stores new refresh token in Redis with 7-day TTL', async () => {
    const redis = makeRedis(user.id);
    const useCase = new RefreshUseCase(redis, makeRepo(user));

    const result = await useCase.execute('old-token');

    expect(redis.set).toHaveBeenCalledWith(
      `refresh:${result.refreshToken}`,
      user.id,
      'EX',
      604800,
    );
  });
});
