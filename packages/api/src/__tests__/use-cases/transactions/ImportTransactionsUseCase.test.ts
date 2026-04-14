import { describe, it, expect, vi } from 'vitest';
import { ImportTransactionsUseCase } from '../../../use-cases/transactions/ImportTransactionsUseCase.js';
import type { ITransactionRepository, Transaction, CreateTransactionDto } from '@financas/shared';

// ---- helpers ----

let idCounter = 0;
const makeTransaction = (data: CreateTransactionDto): Transaction => ({
  id: `tx-${++idCounter}`,
  userId: data.userId,
  accountId: data.accountId,
  categoryId: data.categoryId,
  amount: data.amount,
  type: data.type,
  status: data.status ?? 'confirmed',
  date: data.date,
  description: data.description,
  importSessionId: data.importSessionId,
  importBucket: data.importBucket,
  createdAt: new Date(),
});

const makeRepo = (overrides?: Partial<ITransactionRepository>): ITransactionRepository => ({
  create: vi.fn(async (data: CreateTransactionDto) => makeTransaction(data)),
  findById: vi.fn(async () => null),
  findByUserId: vi.fn(async () => []),
  findByAccountId: vi.fn(async () => []),
  findByUserIdAndDateRange: vi.fn(async () => []),
  findPotentialDuplicates: vi.fn(async () => []),
  findByImportSession: vi.fn(async () => []),
  deleteByImportSession: vi.fn(async () => {}),
  update: vi.fn(async () => null),
  delete: vi.fn(async () => {}),
  ...overrides,
});

const VALID_CSV_HEADER = 'Data,Valor,Identificador,Descrição';

// ---- tests ----

describe('ImportTransactionsUseCase', () => {
  it('classifies 3 valid rows, 1 ignored row, and 1 probable duplicate correctly', async () => {
    // Row 3 will have a bad date → ignored
    // Row 4 will match a duplicate
    const csv = [
      VALID_CSV_HEADER,
      '10/01/2026,-50.00,ext-001,Supermercado',
      '11/01/2026,-30.00,ext-002,Farmacia',
      '12/01/2026,-baddate,ext-003,Invalid Row',  // bad amount → ignored
      '13/01/2026,-100.00,ext-004,Restaurante',
    ].join('\n');

    // Row for ext-004 will find a duplicate
    const existingTx = makeTransaction({
      userId: 'u1',
      accountId: 'acc1',
      amount: 10000,
      type: 'EXPENSE',
      date: new Date('2026-01-13'),
    });

    const repo = makeRepo({
      findPotentialDuplicates: vi.fn(async (_u, _a, amount) => {
        // Only report duplicate for amount 10000 (R$100.00)
        return amount === 10000 ? [existingTx] : [];
      }),
    });

    const useCase = new ImportTransactionsUseCase(repo);
    const result = await useCase.execute('u1', 'acc1', csv);

    expect(result.sessionId).toBeTruthy();
    expect(result.new).toHaveLength(2);        // ext-001, ext-002
    expect(result.probableDuplicates).toHaveLength(1); // ext-004
    expect(result.ignored).toHaveLength(1);    // bad amount row
    expect(result.ignored[0].reason).toMatch(/Invalid amount/);

    // All saved transactions should be pending_review
    for (const tx of [...result.new, ...result.probableDuplicates]) {
      expect(tx.status).toBe('pending_review');
      expect(tx.importSessionId).toBe(result.sessionId);
    }
  });

  it('returns empty arrays for empty CSV (no lines)', async () => {
    const repo = makeRepo();
    const useCase = new ImportTransactionsUseCase(repo);
    const result = await useCase.execute('u1', 'acc1', '');

    expect(result.new).toHaveLength(0);
    expect(result.probableDuplicates).toHaveLength(0);
    expect(result.ignored).toHaveLength(0);
    expect(result.sessionId).toBeTruthy();
  });

  it('returns empty arrays for CSV with only the header row', async () => {
    const repo = makeRepo();
    const useCase = new ImportTransactionsUseCase(repo);
    const result = await useCase.execute('u1', 'acc1', VALID_CSV_HEADER);

    expect(result.new).toHaveLength(0);
    expect(result.probableDuplicates).toHaveLength(0);
    expect(result.ignored).toHaveLength(0);
  });

  it('persists each row with status=pending_review and the session importSessionId', async () => {
    const csv = [
      VALID_CSV_HEADER,
      '01/02/2026,-20.00,ext-010,Uber',
    ].join('\n');

    const createSpy = vi.fn(async (data: CreateTransactionDto) => makeTransaction(data));
    const repo = makeRepo({ create: createSpy });
    const useCase = new ImportTransactionsUseCase(repo);

    const result = await useCase.execute('u1', 'acc1', csv);

    expect(createSpy).toHaveBeenCalledOnce();
    const callArg = createSpy.mock.calls[0][0] as CreateTransactionDto;
    expect(callArg.status).toBe('pending_review');
    expect(callArg.importSessionId).toBe(result.sessionId);
    expect(callArg.importBucket).toBe('new'); // no duplicate → 'new'
    expect(callArg.amount).toBe(2000); // R$20.00 → 2000 centavos
    expect(callArg.type).toBe('EXPENSE');
  });

  it('classifies income rows (positive valor) correctly', async () => {
    const csv = [
      VALID_CSV_HEADER,
      '01/03/2026,500.00,ext-020,Salario',
    ].join('\n');

    const repo = makeRepo();
    const useCase = new ImportTransactionsUseCase(repo);
    const result = await useCase.execute('u1', 'acc1', csv);

    expect(result.new).toHaveLength(1);
    expect(result.new[0].type).toBe('INCOME');
    expect(result.new[0].amount).toBe(50000); // R$500.00 → 50000 centavos
  });
});
