import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterUseCase } from '../../../use-cases/auth/RegisterUseCase.js';
import type { IUserRepository, User } from '@financas/shared';

const makeUser = (overrides?: Partial<User>): User => ({
  id: 'user-1',
  email: 'a@test.com',
  passwordHash: '$hash',
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeRepo = (overrides?: Partial<IUserRepository>): IUserRepository => ({
  create: vi.fn(),
  findByEmail: vi.fn(async () => null),
  findById: vi.fn(async () => null),
  ...overrides,
});

describe('RegisterUseCase', () => {
  it('creates a user and returns id/email/createdAt without passwordHash', async () => {
    const user = makeUser();
    const repo = makeRepo({ create: vi.fn(async () => user) });
    const useCase = new RegisterUseCase(repo);

    const result = await useCase.execute('a@test.com', 'password123');

    expect(result).toEqual({ id: 'user-1', email: 'a@test.com', createdAt: user.createdAt });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('throws EMAIL_EXISTS when email is already registered', async () => {
    const repo = makeRepo({ findByEmail: vi.fn(async () => makeUser()) });
    const useCase = new RegisterUseCase(repo);

    await expect(useCase.execute('a@test.com', 'password123')).rejects.toMatchObject({
      code: 'EMAIL_EXISTS',
    });
  });

  it('does not call repo.create when email exists', async () => {
    const create = vi.fn();
    const repo = makeRepo({ findByEmail: vi.fn(async () => makeUser()), create });
    const useCase = new RegisterUseCase(repo);

    await expect(useCase.execute('a@test.com', 'password123')).rejects.toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });
});
