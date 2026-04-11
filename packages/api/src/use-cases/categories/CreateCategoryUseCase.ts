import { ICategoryRepository, Category } from '@financas/shared';

export class CreateCategoryUseCase {
  constructor(private readonly repo: ICategoryRepository) {}

  async execute(userId: string, name: string): Promise<Category> {
    const existing = await this.repo.findByUserId(userId);
    const normalizedName = name.trim().toLowerCase();
    const duplicate = existing.some(c => c.name.trim().toLowerCase() === normalizedName);
    if (duplicate) throw new Error('DUPLICATE_CATEGORY_NAME');
    return this.repo.create({ userId, name });
  }
}
