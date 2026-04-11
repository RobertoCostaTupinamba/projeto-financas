import { describe, it, expect, vi } from 'vitest';
import type { ICategoryRepository, Category } from '@financas/shared';
import { CreateCategoryUseCase } from '../../../use-cases/categories/CreateCategoryUseCase.js';
import { GetCategoriesUseCase } from '../../../use-cases/categories/GetCategoriesUseCase.js';
import { UpdateCategoryUseCase } from '../../../use-cases/categories/UpdateCategoryUseCase.js';
import { DeleteCategoryUseCase } from '../../../use-cases/categories/DeleteCategoryUseCase.js';

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat1',
    userId: 'user1',
    name: 'Alimentação',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<ICategoryRepository> = {}): ICategoryRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('CreateCategoryUseCase', () => {
  it('creates and returns Category', async () => {
    const category = makeCategory();
    const repo = makeRepo({
      findByUserId: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(category),
    });
    const uc = new CreateCategoryUseCase(repo);

    const result = await uc.execute('user1', 'Alimentação');

    expect(result).toEqual(category);
    expect(repo.create).toHaveBeenCalledWith({ userId: 'user1', name: 'Alimentação' });
  });

  it('throws DUPLICATE_CATEGORY_NAME when name already exists for userId (case-insensitive)', async () => {
    const existing = makeCategory({ name: 'alimentação' });
    const repo = makeRepo({
      findByUserId: vi.fn().mockResolvedValue([existing]),
    });
    const uc = new CreateCategoryUseCase(repo);

    await expect(uc.execute('user1', 'ALIMENTAÇÃO')).rejects.toThrow('DUPLICATE_CATEGORY_NAME');
  });

  it('throws DUPLICATE_CATEGORY_NAME when name matches with whitespace trimming', async () => {
    const existing = makeCategory({ name: 'Transporte' });
    const repo = makeRepo({
      findByUserId: vi.fn().mockResolvedValue([existing]),
    });
    const uc = new CreateCategoryUseCase(repo);

    await expect(uc.execute('user1', '  Transporte  ')).rejects.toThrow('DUPLICATE_CATEGORY_NAME');
  });
});

describe('GetCategoriesUseCase', () => {
  it('returns list of categories for userId', async () => {
    const categories = [makeCategory(), makeCategory({ id: 'cat2', name: 'Transporte' })];
    const repo = makeRepo({ findByUserId: vi.fn().mockResolvedValue(categories) });
    const uc = new GetCategoriesUseCase(repo);

    const result = await uc.execute('user1');

    expect(result).toEqual(categories);
    expect(repo.findByUserId).toHaveBeenCalledWith('user1');
  });
});

describe('UpdateCategoryUseCase', () => {
  it('happy path returns updated Category', async () => {
    const original = makeCategory();
    const updated = makeCategory({ name: 'Alimentação Updated' });
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(original),
      update: vi.fn().mockResolvedValue(updated),
    });
    const uc = new UpdateCategoryUseCase(repo);

    const result = await uc.execute('user1', 'cat1', 'Alimentação Updated');

    expect(result).toEqual(updated);
    expect(repo.update).toHaveBeenCalledWith('cat1', { name: 'Alimentação Updated' });
  });

  it('throws CATEGORY_NOT_FOUND when findById returns null', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const uc = new UpdateCategoryUseCase(repo);

    await expect(uc.execute('user1', 'nonexistent', 'New Name')).rejects.toThrow(
      'CATEGORY_NOT_FOUND',
    );
  });

  it('throws FORBIDDEN when userId mismatch', async () => {
    const category = makeCategory({ userId: 'owner' });
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(category) });
    const uc = new UpdateCategoryUseCase(repo);

    await expect(uc.execute('attacker', 'cat1', 'New Name')).rejects.toThrow('FORBIDDEN');
  });
});

describe('DeleteCategoryUseCase', () => {
  it('happy path calls repo.delete', async () => {
    const category = makeCategory();
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(category),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const uc = new DeleteCategoryUseCase(repo);

    await uc.execute('user1', 'cat1');

    expect(repo.delete).toHaveBeenCalledWith('cat1');
  });

  it('throws CATEGORY_NOT_FOUND when findById returns null', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const uc = new DeleteCategoryUseCase(repo);

    await expect(uc.execute('user1', 'nonexistent')).rejects.toThrow('CATEGORY_NOT_FOUND');
  });

  it('throws FORBIDDEN when userId mismatch', async () => {
    const category = makeCategory({ userId: 'owner' });
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(category) });
    const uc = new DeleteCategoryUseCase(repo);

    await expect(uc.execute('attacker', 'cat1')).rejects.toThrow('FORBIDDEN');
  });
});
