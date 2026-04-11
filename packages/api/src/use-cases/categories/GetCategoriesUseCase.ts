import { ICategoryRepository, Category } from '@financas/shared';

export class GetCategoriesUseCase {
  constructor(private readonly repo: ICategoryRepository) {}

  async execute(userId: string): Promise<Category[]> {
    return this.repo.findByUserId(userId);
  }
}
