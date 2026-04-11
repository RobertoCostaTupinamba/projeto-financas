import { ICategoryRepository, Category } from '@financas/shared';

export class UpdateCategoryUseCase {
  constructor(private readonly repo: ICategoryRepository) {}

  async execute(userId: string, id: string, name: string): Promise<Category> {
    const category = await this.repo.findById(id);
    if (!category) throw new Error('CATEGORY_NOT_FOUND');
    if (category.userId !== userId) throw new Error('FORBIDDEN');
    const updated = await this.repo.update(id, { name });
    return updated!;
  }
}
