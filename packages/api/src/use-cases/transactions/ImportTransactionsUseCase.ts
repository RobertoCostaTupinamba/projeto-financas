import { randomUUID } from 'crypto';
import type { ITransactionRepository, IMerchantRuleRepository, Transaction, PartialMatchSuggestion } from '@financas/shared';
import { NubankCsvParser, type IgnoredRow } from '../../lib/parsers/NubankCsvParser.js';
import { matchMerchant } from '../../lib/merchant/MerchantMatcher.js';

export interface ImportResult {
  sessionId: string;
  new: Transaction[];
  probableDuplicates: Transaction[];
  ignored: IgnoredRow[];
  partialMatchSuggestions: PartialMatchSuggestion[];
}

export class ImportTransactionsUseCase {
  private readonly parser = new NubankCsvParser();

  constructor(
    private readonly transactionRepo: ITransactionRepository,
    private readonly merchantRuleRepo?: IMerchantRuleRepository,
  ) {}

  async execute(userId: string, accountId: string, csvText: string): Promise<ImportResult> {
    const sessionId = randomUUID();
    const { valid, ignored } = this.parser.parse(csvText);

    const newTransactions: Transaction[] = [];
    const probableDuplicates: Transaction[] = [];
    const partialMatchSuggestions: PartialMatchSuggestion[] = [];

    // Load merchant rules once before the row loop (only if repo is wired)
    const rules = this.merchantRuleRepo ? await this.merchantRuleRepo.findByUserId(userId) : [];

    for (const row of valid) {
      const dateFrom = new Date(row.date);
      dateFrom.setDate(dateFrom.getDate() - 1);

      const dateTo = new Date(row.date);
      dateTo.setDate(dateTo.getDate() + 1);

      const matches = await this.transactionRepo.findPotentialDuplicates(
        userId,
        accountId,
        row.amountCentavos,
        dateFrom,
        dateTo,
      );

      const bucket = matches.length > 0 ? 'probable_duplicate' : 'new';

      // For 'new' rows, check merchant rules once
      let exactCategoryId: string | undefined;
      let partialMatch: { rule: { id: string; categoryId: string; pattern: string } } | null = null;

      if (bucket === 'new' && rules.length > 0) {
        const ruleMatch = matchMerchant(row.description ?? '', rules);
        if (ruleMatch) {
          if (ruleMatch.matchType === 'exact') {
            exactCategoryId = ruleMatch.rule.categoryId;
          } else if (ruleMatch.matchType === 'partial') {
            partialMatch = ruleMatch;
          }
        }
      }

      const saved = await this.transactionRepo.create({
        userId,
        accountId,
        amount: row.amountCentavos,
        type: row.type,
        date: row.date,
        description: row.description,
        status: 'pending_review',
        importSessionId: sessionId,
        importBucket: bucket,
        ...(exactCategoryId ? { categoryId: exactCategoryId } : {}),
      });

      if (bucket === 'probable_duplicate') {
        probableDuplicates.push(saved);
      } else {
        newTransactions.push(saved);

        if (partialMatch) {
          partialMatchSuggestions.push({
            transactionId: saved.id,
            suggestedCategoryId: partialMatch.rule.categoryId,
            matchedPattern: partialMatch.rule.pattern,
            ruleId: partialMatch.rule.id,
          });
        }
      }
    }

    return {
      sessionId,
      new: newTransactions,
      probableDuplicates,
      ignored,
      partialMatchSuggestions,
    };
  }
}
