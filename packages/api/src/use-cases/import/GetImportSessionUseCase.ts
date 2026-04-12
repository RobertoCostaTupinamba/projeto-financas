import type { ITransactionRepository, Transaction, ImportBucket } from '@financas/shared';

export interface ImportSessionResult {
  sessionId: string;
  new: Transaction[];
  probableDuplicates: Transaction[];
  ignored: Transaction[];
}

export class GetImportSessionUseCase {
  constructor(private readonly transactionRepo: ITransactionRepository) {}

  async execute(sessionId: string): Promise<ImportSessionResult> {
    const transactions = await this.transactionRepo.findByImportSession(sessionId);

    const buckets: Record<ImportBucket | 'ignored', Transaction[]> = {
      new: [],
      probable_duplicate: [],
      ignored: [],
    };

    for (const tx of transactions) {
      const bucket = tx.importBucket ?? 'ignored';
      buckets[bucket].push(tx);
    }

    return {
      sessionId,
      new: buckets.new,
      probableDuplicates: buckets.probable_duplicate,
      ignored: buckets.ignored,
    };
  }
}
