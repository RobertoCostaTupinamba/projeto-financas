import { ITransactionRepository, Transaction, CreateTransactionDto, UpdateTransactionDto } from '@financas/shared';
import { TransactionModel } from '../db/TransactionModel.js';

function toPlain(doc: any): Transaction {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    accountId: doc.accountId,
    categoryId: doc.categoryId,
    amount: doc.amount,
    type: doc.type,
    status: doc.status ?? 'confirmed',
    date: doc.date,
    description: doc.description,
    importSessionId: doc.importSessionId,
    importBucket: doc.importBucket,
    createdAt: doc.createdAt,
  };
}

export class MongoTransactionRepository implements ITransactionRepository {
  async create(data: CreateTransactionDto): Promise<Transaction> {
    const doc = await TransactionModel.create(data);
    return toPlain(doc);
  }

  async findById(id: string): Promise<Transaction | null> {
    const doc = await TransactionModel.findById(id);
    return doc ? toPlain(doc) : null;
  }

  async findByUserId(userId: string): Promise<Transaction[]> {
    const docs = await TransactionModel.find({ userId });
    return docs.map(toPlain);
  }

  async findByAccountId(accountId: string): Promise<Transaction[]> {
    const docs = await TransactionModel.find({ accountId });
    return docs.map(toPlain);
  }

  async findByUserIdAndDateRange(userId: string, start: Date, end: Date): Promise<Transaction[]> {
    const docs = await TransactionModel.find({
      userId,
      date: { $gte: start, $lt: end },
      status: { $ne: 'pending_review' },
    });
    return docs.map(toPlain);
  }

  async findPotentialDuplicates(
    userId: string,
    accountId: string,
    amount: number,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Transaction[]> {
    const docs = await TransactionModel.find({
      userId,
      accountId,
      amount,
      date: { $gte: dateFrom, $lte: dateTo },
    });
    return docs.map(toPlain);
  }

  async findByImportSession(importSessionId: string): Promise<Transaction[]> {
    const docs = await TransactionModel.find({ importSessionId });
    return docs.map(toPlain);
  }

  async deleteByImportSession(importSessionId: string): Promise<void> {
    await TransactionModel.deleteMany({ importSessionId });
  }

  async update(id: string, data: UpdateTransactionDto): Promise<Transaction | null> {
    const doc = await TransactionModel.findByIdAndUpdate(id, data, { new: true });
    return doc ? toPlain(doc) : null;
  }

  async delete(id: string): Promise<void> {
    await TransactionModel.findByIdAndDelete(id);
  }
}
