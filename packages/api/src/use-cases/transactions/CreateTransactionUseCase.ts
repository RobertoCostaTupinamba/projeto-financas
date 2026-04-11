import { ITransactionRepository, Transaction, TransactionType } from '@financas/shared';

interface CreateTransactionBody {
  accountId: string;
  categoryId?: string;
  amount: number;
  type: TransactionType;
  date: Date;
  description?: string;
}

export class CreateTransactionUseCase {
  constructor(private readonly repo: ITransactionRepository) {}

  async execute(userId: string, body: CreateTransactionBody): Promise<Transaction> {
    if (body.amount <= 0) throw new Error('INVALID_AMOUNT');
    return this.repo.create({ userId, ...body });
  }
}
