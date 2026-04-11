import { ICategoryRepository, Category, CreateCategoryDto, UpdateCategoryDto } from '@financas/shared';
import { CategoryModel } from '../db/CategoryModel.js';

function toPlain(doc: any): Category {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    name: doc.name,
    createdAt: doc.createdAt,
  };
}

export class MongoCategoryRepository implements ICategoryRepository {
  async create(data: CreateCategoryDto): Promise<Category> {
    const doc = await CategoryModel.create(data);
    return toPlain(doc);
  }

  async findById(id: string): Promise<Category | null> {
    const doc = await CategoryModel.findById(id);
    return doc ? toPlain(doc) : null;
  }

  async findByUserId(userId: string): Promise<Category[]> {
    const docs = await CategoryModel.find({ userId });
    return docs.map(toPlain);
  }

  async update(id: string, data: UpdateCategoryDto): Promise<Category | null> {
    const doc = await CategoryModel.findByIdAndUpdate(id, data, { new: true });
    return doc ? toPlain(doc) : null;
  }

  async delete(id: string): Promise<void> {
    await CategoryModel.findByIdAndDelete(id);
  }
}
