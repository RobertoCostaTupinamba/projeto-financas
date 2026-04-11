import { ICategoryRepository } from '@financas/shared';

export class DeleteCategoryUseCase {
  constructor(private readonly repo: ICategoryRepository) {}

  async execute(userId: string, id: string): Promise<void> {
    const category = await this.repo.findById(id);
    if (!category) throw new Error('CATEGORY_NOT_FOUND');
    if (category.userId !== userId) throw new Error('FORBIDDEN');
    await this.repo.delete(id);
  }
}
