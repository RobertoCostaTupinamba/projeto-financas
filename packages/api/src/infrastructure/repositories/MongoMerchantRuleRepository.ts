import { IMerchantRuleRepository, MerchantRule, CreateMerchantRuleDto } from '@financas/shared';
import { MerchantRuleModel } from '../db/MerchantRuleModel.js';

function toPlain(doc: any): MerchantRule {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    pattern: doc.pattern,
    categoryId: doc.categoryId,
    matchType: doc.matchType,
    createdAt: doc.createdAt,
  };
}

export class MongoMerchantRuleRepository implements IMerchantRuleRepository {
  async create(data: CreateMerchantRuleDto): Promise<MerchantRule> {
    const doc = await MerchantRuleModel.create(data);
    return toPlain(doc);
  }

  async findById(id: string): Promise<MerchantRule | null> {
    const doc = await MerchantRuleModel.findById(id);
    return doc ? toPlain(doc) : null;
  }

  async findByUserId(userId: string): Promise<MerchantRule[]> {
    const docs = await MerchantRuleModel.find({ userId });
    return docs.map(toPlain);
  }

  async findByUserIdAndPattern(userId: string, pattern: string): Promise<MerchantRule | null> {
    const doc = await MerchantRuleModel.findOne({ userId, pattern });
    return doc ? toPlain(doc) : null;
  }

  async delete(id: string): Promise<void> {
    await MerchantRuleModel.findByIdAndDelete(id);
  }
}
