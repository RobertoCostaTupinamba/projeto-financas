import { describe, it, expect, vi } from 'vitest';
import { GetImportSessionUseCase } from '../../../use-cases/import/GetImportSessionUseCase.js';
import { ConfirmImportUseCase } from '../../../use-cases/import/ConfirmImportUseCase.js';
import { CancelImportUseCase } from '../../../use-cases/import/CancelImportUseCase.js';
import type { ITransactionRepository, Transaction, CreateTransactionDto, UpdateTransactionDto } from '@financas/shared';

// ---- helpers ----

let idCounter = 0;
const makeTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${++idCounter}`,
  userId: 'u1',
  accountId: 'acc1',
  amount: 1000,
  type: 'EXPENSE',
  status: 'pending_review',
  date: new Date('2026-04-10'),
  importSessionId: 'sess-1',
  importBucket: 'new',
  createdAt: new Date(),
  ...overrides,
});

const makeRepo = (overrides?: Partial<ITransactionRepository>): ITransactionRepository => ({
  create: vi.fn(async (_data: CreateTransactionDto) => makeTransaction()),
  findById: vi.fn(async () => null),
  findByUserId: vi.fn(async () => []),
  findByAccountId: vi.fn(async () => []),
  findByUserIdAndDateRange: vi.fn(async () => []),
  findPotentialDuplicates: vi.fn(async () => []),
  findByImportSession: vi.fn(async () => []),
  deleteByImportSession: vi.fn(async () => {}),
  update: vi.fn(async (_id: string, data: UpdateTransactionDto) => makeTransaction({ status: data.status })),
  delete: vi.fn(async () => {}),
  ...overrides,
});

// ---- GetImportSessionUseCase ----

describe('GetImportSessionUseCase', () => {
  it('partitions transactions into correct buckets', async () => {
    const newTx = makeTransaction({ importBucket: 'new' });
    const dupTx = makeTransaction({ importBucket: 'probable_duplicate' });

    const repo = makeRepo({
      findByImportSession: vi.fn(async () => [newTx, dupTx]),
    });

    const useCase = new GetImportSessionUseCase(repo);
    const result = await useCase.execute('sess-1');

    expect(result.sessionId).toBe('sess-1');
    expect(result.new).toHaveLength(1);
    expect(result.new[0].id).toBe(newTx.id);
    expect(result.probableDuplicates).toHaveLength(1);
    expect(result.probableDuplicates[0].id).toBe(dupTx.id);
    expect(result.ignored).toHaveLength(0);
  });

  it('places transactions with no importBucket into ignored', async () => {
    const tx = makeTransaction({ importBucket: undefined });

    const repo = makeRepo({
      findByImportSession: vi.fn(async () => [tx]),
    });

    const useCase = new GetImportSessionUseCase(repo);
    const result = await useCase.execute('sess-1');

    expect(result.new).toHaveLength(0);
    expect(result.probableDuplicates).toHaveLength(0);
    expect(result.ignored).toHaveLength(1);
  });

  it('returns empty buckets when session has no transactions', async () => {
    const repo = makeRepo({ findByImportSession: vi.fn(async () => []) });
    const useCase = new GetImportSessionUseCase(repo);
    const result = await useCase.execute('empty-session');

    expect(result.new).toHaveLength(0);
    expect(result.probableDuplicates).toHaveLength(0);
    expect(result.ignored).toHaveLength(0);
  });
});

// ---- ConfirmImportUseCase ----

describe('ConfirmImportUseCase', () => {
  it('accepts accepted transactions by updating status to confirmed', async () => {
    const tx1 = makeTransaction({ id: 'tx-accept-1' });
    const updateSpy = vi.fn(async (_id: string, data: UpdateTransactionDto) =>
      makeTransaction({ id: _id, status: data.status }),
    );

    const repo = makeRepo({
      update: updateSpy,
      findByImportSession: vi.fn(async () => []), // no orphans
    });

    const useCase = new ConfirmImportUseCase(repo);
    const result = await useCase.execute('sess-1', 'u1', [{ transactionId: tx1.id, action: 'accept' }]);

    expect(updateSpy).toHaveBeenCalledWith(tx1.id, { status: 'confirmed' });
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].status).toBe('confirmed');
    expect(result.rejected).toBe(0);
  });

  it('deletes rejected transactions', async () => {
    const tx1 = makeTransaction({ id: 'tx-reject-1' });
    const deleteSpy = vi.fn(async () => {});

    const repo = makeRepo({
      delete: deleteSpy,
      findByImportSession: vi.fn(async () => []), // no orphans
    });

    const useCase = new ConfirmImportUseCase(repo);
    const result = await useCase.execute('sess-1', 'u1', [{ transactionId: tx1.id, action: 'reject' }]);

    expect(deleteSpy).toHaveBeenCalledWith(tx1.id);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toBe(1);
  });

  it('cleans up orphaned pending_review rows not in decisions', async () => {
    const decidedTx = makeTransaction({ id: 'tx-decided', status: 'pending_review' });
    const orphanTx = makeTransaction({ id: 'tx-orphan', status: 'pending_review' });

    const deleteSpy = vi.fn(async () => {});

    const repo = makeRepo({
      update: vi.fn(async (_id, data) => makeTransaction({ id: _id, status: data.status })),
      delete: deleteSpy,
      // findByImportSession returns the orphan (decided one is now confirmed, not pending_review)
      findByImportSession: vi.fn(async () => [orphanTx]),
    });

    const useCase = new ConfirmImportUseCase(repo);
    const result = await useCase.execute('sess-1', 'u1', [{ transactionId: decidedTx.id, action: 'accept' }]);

    // orphan must be cleaned
    expect(deleteSpy).toHaveBeenCalledWith(orphanTx.id);
    expect(result.cleaned).toBe(1);
  });

  it('does not clean up transactions already decided', async () => {
    const tx = makeTransaction({ id: 'tx-decided', status: 'pending_review' });

    const deleteSpy = vi.fn(async () => {});

    const repo = makeRepo({
      update: vi.fn(async (_id, data) => makeTransaction({ id: _id, status: data.status })),
      delete: deleteSpy,
      // findByImportSession returns the same tx — but it's in the decisions set so not an orphan
      findByImportSession: vi.fn(async () => [tx]),
    });

    const useCase = new ConfirmImportUseCase(repo);
    const result = await useCase.execute('sess-1', 'u1', [{ transactionId: tx.id, action: 'accept' }]);

    // delete was NOT called for the decided tx
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(result.cleaned).toBe(0);
  });

  it('handles empty decisions array (cleans all pending_review in session)', async () => {
    const orphan = makeTransaction({ id: 'tx-orphan', status: 'pending_review' });
    const deleteSpy = vi.fn(async () => {});

    const repo = makeRepo({
      delete: deleteSpy,
      findByImportSession: vi.fn(async () => [orphan]),
    });

    const useCase = new ConfirmImportUseCase(repo);
    const result = await useCase.execute('sess-1', 'u1', []);

    expect(deleteSpy).toHaveBeenCalledWith(orphan.id);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toBe(0);
    expect(result.cleaned).toBe(1);
  });
});

// ---- CancelImportUseCase ----

describe('CancelImportUseCase', () => {
  it('calls deleteByImportSession with the session id', async () => {
    const deleteBySessionSpy = vi.fn(async () => {});
    const repo = makeRepo({ deleteByImportSession: deleteBySessionSpy });

    const useCase = new CancelImportUseCase(repo);
    await useCase.execute('sess-xyz');

    expect(deleteBySessionSpy).toHaveBeenCalledOnce();
    expect(deleteBySessionSpy).toHaveBeenCalledWith('sess-xyz');
  });
});
