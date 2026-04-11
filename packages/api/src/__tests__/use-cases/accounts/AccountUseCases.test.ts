import { describe, it, expect, vi } from 'vitest';
import type { IAccountRepository, Account } from '@financas/shared';
import { CreateAccountUseCase } from '../../../use-cases/accounts/CreateAccountUseCase.js';
import { GetAccountsUseCase } from '../../../use-cases/accounts/GetAccountsUseCase.js';
import { UpdateAccountUseCase } from '../../../use-cases/accounts/UpdateAccountUseCase.js';
import { DeleteAccountUseCase } from '../../../use-cases/accounts/DeleteAccountUseCase.js';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc1',
    userId: 'user1',
    name: 'Nubank',
    type: 'CHECKING',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<IAccountRepository> = {}): IAccountRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('CreateAccountUseCase', () => {
  it('creates and returns Account', async () => {
    const account = makeAccount();
    const repo = makeRepo({ create: vi.fn().mockResolvedValue(account) });
    const uc = new CreateAccountUseCase(repo);

    const result = await uc.execute('user1', { name: 'Nubank', type: 'CHECKING' });

    expect(result).toEqual(account);
    expect(repo.create).toHaveBeenCalledWith({ userId: 'user1', name: 'Nubank', type: 'CHECKING' });
  });
});

describe('GetAccountsUseCase', () => {
  it('returns filtered accounts for userId', async () => {
    const accounts = [makeAccount(), makeAccount({ id: 'acc2', name: 'Itaú' })];
    const repo = makeRepo({ findByUserId: vi.fn().mockResolvedValue(accounts) });
    const uc = new GetAccountsUseCase(repo);

    const result = await uc.execute('user1');

    expect(result).toEqual(accounts);
    expect(repo.findByUserId).toHaveBeenCalledWith('user1');
  });
});

describe('UpdateAccountUseCase', () => {
  it('happy path returns updated Account', async () => {
    const original = makeAccount();
    const updated = makeAccount({ name: 'Nubank Updated' });
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(original),
      update: vi.fn().mockResolvedValue(updated),
    });
    const uc = new UpdateAccountUseCase(repo);

    const result = await uc.execute('user1', 'acc1', { name: 'Nubank Updated' });

    expect(result).toEqual(updated);
  });

  it('throws ACCOUNT_NOT_FOUND when findById returns null', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const uc = new UpdateAccountUseCase(repo);

    await expect(uc.execute('user1', 'nonexistent', { name: 'X' })).rejects.toThrow(
      'ACCOUNT_NOT_FOUND',
    );
  });

  it('throws FORBIDDEN when userId mismatch', async () => {
    const account = makeAccount({ userId: 'owner' });
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(account) });
    const uc = new UpdateAccountUseCase(repo);

    await expect(uc.execute('attacker', 'acc1', { name: 'X' })).rejects.toThrow('FORBIDDEN');
  });
});

describe('DeleteAccountUseCase', () => {
  it('happy path calls repo.delete', async () => {
    const account = makeAccount();
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(account),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const uc = new DeleteAccountUseCase(repo);

    await uc.execute('user1', 'acc1');

    expect(repo.delete).toHaveBeenCalledWith('acc1');
  });

  it('throws ACCOUNT_NOT_FOUND when findById returns null', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const uc = new DeleteAccountUseCase(repo);

    await expect(uc.execute('user1', 'nonexistent')).rejects.toThrow('ACCOUNT_NOT_FOUND');
  });

  it('throws FORBIDDEN when userId mismatch', async () => {
    const account = makeAccount({ userId: 'owner' });
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(account) });
    const uc = new DeleteAccountUseCase(repo);

    await expect(uc.execute('attacker', 'acc1')).rejects.toThrow('FORBIDDEN');
  });
});
