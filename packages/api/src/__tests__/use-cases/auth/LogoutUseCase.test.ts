import { describe, it, expect, vi } from 'vitest';
import { LogoutUseCase } from '../../../use-cases/auth/LogoutUseCase.js';
import type { Redis } from 'ioredis';

const makeRedis = (delReturn = 0): Redis =>
  ({ del: vi.fn(async () => delReturn) } as unknown as Redis);

describe('LogoutUseCase', () => {
  it('deletes the refresh token from Redis', async () => {
    const redis = makeRedis(1);
    const useCase = new LogoutUseCase(redis);

    await useCase.execute('some-token');

    expect(redis.del).toHaveBeenCalledWith('refresh:some-token');
  });

  it('does not throw when token does not exist in Redis (del returns 0)', async () => {
    const redis = makeRedis(0);
    const useCase = new LogoutUseCase(redis);

    await expect(useCase.execute('nonexistent-token')).resolves.toBeUndefined();
  });

  it('returns immediately without calling Redis when refreshToken is undefined', async () => {
    const redis = makeRedis();
    const useCase = new LogoutUseCase(redis);

    await useCase.execute(undefined);

    expect(redis.del).not.toHaveBeenCalled();
  });

  it('returns immediately without calling Redis when refreshToken is empty string', async () => {
    const redis = makeRedis();
    const useCase = new LogoutUseCase(redis);

    await useCase.execute('');

    expect(redis.del).not.toHaveBeenCalled();
  });
});
