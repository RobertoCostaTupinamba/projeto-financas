import { ITransactionRepository } from '@financas/shared';

export class DeleteTransactionUseCase {
  constructor(private readonly repo: ITransactionRepository) {}

  async execute(userId: string, id: string): Promise<void> {
    const transaction = await this.repo.findById(id);
    if (!transaction) throw new Error('TRANSACTION_NOT_FOUND');
    if (transaction.userId !== userId) throw new Error('FORBIDDEN');
    await this.repo.delete(id);
  }
}
