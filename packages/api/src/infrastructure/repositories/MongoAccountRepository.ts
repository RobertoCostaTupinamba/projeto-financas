import { IAccountRepository, Account, CreateAccountDto } from '@financas/shared';
import { AccountModel } from '../db/AccountModel.js';

function toPlain(doc: any): Account {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    name: doc.name,
    type: doc.type,
    closingDay: doc.closingDay,
    dueDay: doc.dueDay,
    createdAt: doc.createdAt,
  };
}

export class MongoAccountRepository implements IAccountRepository {
  async create(data: CreateAccountDto): Promise<Account> {
    const doc = await AccountModel.create(data);
    return toPlain(doc);
  }

  async findById(id: string): Promise<Account | null> {
    const doc = await AccountModel.findById(id);
    return doc ? toPlain(doc) : null;
  }

  async findByUserId(userId: string): Promise<Account[]> {
    const docs = await AccountModel.find({ userId });
    return docs.map(toPlain);
  }

  async delete(id: string): Promise<void> {
    await AccountModel.findByIdAndDelete(id);
  }
}
