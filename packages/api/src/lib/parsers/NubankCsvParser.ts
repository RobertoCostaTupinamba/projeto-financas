import type { TransactionType } from '@financas/shared';

export interface ParsedRow {
  date: Date;
  amountCentavos: number;
  type: TransactionType;
  description: string;
  externalId: string;
}

export interface IgnoredRow {
  rowIndex: number;
  rawLine: string;
  reason: string;
}

export interface ParseResult {
  valid: ParsedRow[];
  ignored: IgnoredRow[];
}

const EXPECTED_HEADER = 'Data,Valor,Identificador,Descrição';

export class NubankCsvParser {
  parse(csvText: string): ParseResult {
    const lines = csvText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length === 0) {
      return { valid: [], ignored: [] };
    }

    const header = lines[0];
    if (header !== EXPECTED_HEADER) {
      throw new Error(`Invalid CSV header. Expected "${EXPECTED_HEADER}", got "${header}"`);
    }

    const dataLines = lines.slice(1);
    const valid: ParsedRow[] = [];
    const ignored: IgnoredRow[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      const rawLine = dataLines[i];
      const rowIndex = i + 1; // 1-based, header is row 0

      // Split on comma but respect that description may not have commas here
      const parts = rawLine.split(',');
      if (parts.length < 4) {
        ignored.push({ rowIndex, rawLine, reason: `Expected 4 columns, got ${parts.length}` });
        continue;
      }

      const [rawDate, rawValor, rawId, ...descParts] = parts;
      const description = descParts.join(',').trim();
      const externalId = rawId.trim();

      // Validate date
      const dateStr = rawDate.trim();
      const dateMs = Date.parse(dateStr);
      if (isNaN(dateMs)) {
        ignored.push({ rowIndex, rawLine, reason: `Invalid date: "${dateStr}"` });
        continue;
      }
      const date = new Date(dateMs);

      // Validate amount
      const valor = parseFloat(rawValor.trim());
      if (isNaN(valor)) {
        ignored.push({ rowIndex, rawLine, reason: `Invalid amount: "${rawValor.trim()}"` });
        continue;
      }

      const amountCentavos = Math.round(Math.abs(valor) * 100);
      const type: TransactionType = valor < 0 ? 'EXPENSE' : 'INCOME';

      valid.push({ date, amountCentavos, type, description, externalId });
    }

    return { valid, ignored };
  }
}
