import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { LoginUseCase } from '../../../use-cases/auth/LoginUseCase.js';
import type { IUserRepository, User } from '@financas/shared';
import type { Redis } from 'ioredis';

const makeUser = async (): Promise<User> => ({
  id: 'user-1',
  email: 'a@test.com',
  passwordHash: await bcrypt.hash('correct-pass', 10),
  createdAt: new Date('2026-01-01'),
});

const makeRepo = (user: User | null): IUserRepository => ({
  create: vi.fn(),
  findByEmail: vi.fn(async () => user),
  findById: vi.fn(async () => user),
});

const makeRedis = (): Redis => ({ set: vi.fn(async () => 'OK') } as unknown as Redis);

describe('LoginUseCase', () => {
  it('returns accessToken and refreshToken on valid credentials', async () => {
    const user = await makeUser();
    const useCase = new LoginUseCase(makeRepo(user), makeRedis());

    const result = await useCase.execute('a@test.com', 'correct-pass');

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(typeof result.accessToken).toBe('string');
    expect(result.accessToken.split('.').length).toBe(3); // valid JWT structure
  });

  it('throws INVALID_CREDENTIALS for unknown email', async () => {
    const useCase = new LoginUseCase(makeRepo(null), makeRedis());

    await expect(useCase.execute('unknown@test.com', 'any')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('throws INVALID_CREDENTIALS for wrong password — same error as unknown email', async () => {
    const user = await makeUser();
    const useCase = new LoginUseCase(makeRepo(user), makeRedis());

    await expect(useCase.execute('a@test.com', 'wrong-pass')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('stores refresh token in Redis with 7-day TTL', async () => {
    const user = await makeUser();
    const redis = makeRedis();
    const useCase = new LoginUseCase(makeRepo(user), redis);

    const result = await useCase.execute('a@test.com', 'correct-pass');

    expect(redis.set).toHaveBeenCalledWith(
      `refresh:${result.refreshToken}`,
      user.id,
      'EX',
      604800,
    );
  });
});
