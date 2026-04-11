import { ITransactionRepository, Transaction, UpdateTransactionDto } from '@financas/shared';

export class UpdateTransactionUseCase {
  constructor(private readonly repo: ITransactionRepository) {}

  async execute(userId: string, id: string, data: UpdateTransactionDto): Promise<Transaction> {
    const transaction = await this.repo.findById(id);
    if (!transaction) throw new Error('TRANSACTION_NOT_FOUND');
    if (transaction.userId !== userId) throw new Error('FORBIDDEN');
    const updated = await this.repo.update(id, data);
    return updated!;
  }
}
