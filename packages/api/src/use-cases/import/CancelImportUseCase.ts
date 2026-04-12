import type { ITransactionRepository } from '@financas/shared';

export class CancelImportUseCase {
  constructor(private readonly transactionRepo: ITransactionRepository) {}

  async execute(sessionId: string): Promise<void> {
    await this.transactionRepo.deleteByImportSession(sessionId);
  }
}
