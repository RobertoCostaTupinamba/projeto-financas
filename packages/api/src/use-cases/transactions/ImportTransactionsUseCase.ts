import { randomUUID } from 'crypto';
import type { ITransactionRepository, Transaction } from '@financas/shared';
import { NubankCsvParser, type IgnoredRow } from '../../lib/parsers/NubankCsvParser.js';

export interface ImportResult {
  sessionId: string;
  new: Transaction[];
  probableDuplicates: Transaction[];
  ignored: IgnoredRow[];
}

export class ImportTransactionsUseCase {
  private readonly parser = new NubankCsvParser();

  constructor(private readonly transactionRepo: ITransactionRepository) {}

  async execute(userId: string, accountId: string, csvText: string): Promise<ImportResult> {
    const sessionId = randomUUID();
    const { valid, ignored } = this.parser.parse(csvText);

    const newTransactions: Transaction[] = [];
    const probableDuplicates: Transaction[] = [];

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

      const saved = await this.transactionRepo.create({
        userId,
        accountId,
        amount: row.amountCentavos,
        type: row.type,
        date: row.date,
        description: row.description,
        status: 'pending_review',
        importSessionId: sessionId,
      });

      if (matches.length > 0) {
        probableDuplicates.push(saved);
      } else {
        newTransactions.push(saved);
      }
    }

    return {
      sessionId,
      new: newTransactions,
      probableDuplicates,
      ignored,
    };
  }
}
