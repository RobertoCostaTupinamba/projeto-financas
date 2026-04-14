import type { ITransactionRepository, IMerchantRuleRepository, Transaction } from '@financas/shared';
import { normalizeMerchant } from '../../lib/merchant/MerchantMatcher.js';

export interface ImportDecision {
  transactionId: string;
  action: 'accept' | 'reject';
  categoryId?: string;
  saveRule?: boolean;
  merchantPattern?: string;
  acceptRuleSuggestion?: boolean;
  ruleSuggestion?: { merchantPattern: string; categoryId: string };
}

export interface ConfirmImportResult {
  accepted: Transaction[];
  rejected: number;
  cleaned: number;
}

export class ConfirmImportUseCase {
  constructor(private readonly transactionRepo: ITransactionRepository) {}

  async execute(
    sessionId: string,
    userId: string,
    decisions: ImportDecision[],
    merchantRuleRepo?: IMerchantRuleRepository,
  ): Promise<ConfirmImportResult> {
    const decided = new Set(decisions.map((d) => d.transactionId));
    const accepted: Transaction[] = [];
    let rejected = 0;

    for (const decision of decisions) {
      if (decision.action === 'accept') {
        const updatePayload = decision.categoryId
          ? { status: 'confirmed' as const, categoryId: decision.categoryId }
          : { status: 'confirmed' as const };

        const updated = await this.transactionRepo.update(decision.transactionId, updatePayload);
        if (updated) {
          accepted.push(updated);
        }

        // Save exact merchant rule if requested
        if (
          decision.saveRule &&
          decision.merchantPattern &&
          decision.categoryId &&
          merchantRuleRepo
        ) {
          const rule = await merchantRuleRepo.create({
            userId,
            pattern: normalizeMerchant(decision.merchantPattern),
            categoryId: decision.categoryId,
            matchType: 'exact',
          });
          // Structured log handled by route layer via Pino — rule object available for logging
          void rule;
        }

        // Save confirmed_partial rule if user accepted a partial-match suggestion
        if (decision.acceptRuleSuggestion && decision.ruleSuggestion && merchantRuleRepo) {
          const rule = await merchantRuleRepo.create({
            userId,
            pattern: decision.ruleSuggestion.merchantPattern,
            categoryId: decision.ruleSuggestion.categoryId,
            matchType: 'confirmed_partial',
          });
          void rule;
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
