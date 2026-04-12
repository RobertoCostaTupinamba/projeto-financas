import type { ITransactionRepository, Transaction } from '@financas/shared';

export interface ImportDecision {
  transactionId: string;
  action: 'accept' | 'reject';
}

export interface ConfirmImportResult {
  accepted: Transaction[];
  rejected: number;
  cleaned: number;
}

export class ConfirmImportUseCase {
  constructor(private readonly transactionRepo: ITransactionRepository) {}

  async execute(sessionId: string, decisions: ImportDecision[]): Promise<ConfirmImportResult> {
    const decided = new Set(decisions.map((d) => d.transactionId));
    const accepted: Transaction[] = [];
    let rejected = 0;

    for (const decision of decisions) {
      if (decision.action === 'accept') {
        const updated = await this.transactionRepo.update(decision.transactionId, {
          status: 'confirmed',
        });
        if (updated) {
          accepted.push(updated);
        }
      } else {
        await this.transactionRepo.delete(decision.transactionId);
        rejected++;
      }
    }

    // Clean up any remaining pending_review transactions in the session that were
    // not mentioned in decisions — prevents orphaned pending_review rows.
    const remaining = await this.transactionRepo.findByImportSession(sessionId);
    let cleaned = 0;
    for (const tx of remaining) {
      if (!decided.has(tx.id) && tx.status === 'pending_review') {
        await this.transactionRepo.delete(tx.id);
        cleaned++;
      }
    }

    return { accepted, rejected, cleaned };
  }
}
