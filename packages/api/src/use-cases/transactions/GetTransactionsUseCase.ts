import { ITransactionRepository, Transaction } from '@financas/shared';

interface GetTransactionsOptions {
  year?: number;
  month?: number;
}

export class GetTransactionsUseCase {
  constructor(private readonly repo: ITransactionRepository) {}

  async execute(userId: string, options: GetTransactionsOptions = {}): Promise<Transaction[]> {
    const { year, month } = options;
    if (month !== undefined && year !== undefined) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      return this.repo.findByUserIdAndDateRange(userId, start, end);
    }
    return this.repo.findByUserId(userId);
  }
}
