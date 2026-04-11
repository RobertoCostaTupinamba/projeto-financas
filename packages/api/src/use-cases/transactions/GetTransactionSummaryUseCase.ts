import { ITransactionRepository, ICategoryRepository } from '@financas/shared';

export class GetTransactionSummaryUseCase {
  constructor(
    private readonly transactionRepo: ITransactionRepository,
    private readonly categoryRepo: ICategoryRepository,
  ) {}

  async execute(userId: string, year: number, month: number): Promise<Record<string, number>> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const [transactions, categories] = await Promise.all([
      this.transactionRepo.findByUserIdAndDateRange(userId, start, end),
      this.categoryRepo.findByUserId(userId),
    ]);

    const catMap = new Map(categories.map((c) => [c.id, c.name]));

    const summary: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE') continue;
      const catName = tx.categoryId ? (catMap.get(tx.categoryId) ?? 'Uncategorized') : 'Uncategorized';
      summary[catName] = (summary[catName] ?? 0) + tx.amount;
    }

    return summary;
  }
}
