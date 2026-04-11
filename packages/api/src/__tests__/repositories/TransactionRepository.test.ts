import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../infrastructure/db/connection.js';
import { MongoTransactionRepository } from '../../infrastructure/repositories/MongoTransactionRepository.js';

const TEST_URI = 'mongodb://localhost:27017/financas_test';
const repo = new MongoTransactionRepository();
const userId1 = new mongoose.Types.ObjectId().toString();
const userId2 = new mongoose.Types.ObjectId().toString();
const accountId1 = new mongoose.Types.ObjectId().toString();
const accountId2 = new mongoose.Types.ObjectId().toString();
const baseDate = new Date('2026-01-15');

beforeAll(async () => { await connectDB(TEST_URI); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await disconnectDB(); });
beforeEach(async () => { await mongoose.connection.collection('transactions').drop().catch(() => {}); });

describe('MongoTransactionRepository', () => {
  it('creates an EXPENSE transaction and amount is stored as integer centavos', async () => {
    const tx = await repo.create({
      userId: userId1,
      accountId: accountId1,
      amount: 1000,
      type: 'EXPENSE',
      date: baseDate,
    });
    expect(tx.id).toBeDefined();
    expect(tx.amount).toBe(1000);
    expect(tx.type).toBe('EXPENSE');
    const found = await repo.findById(tx.id);
    expect(found).not.toBeNull();
    expect(found!.amount).toBe(1000);
    expect(Number.isInteger(found!.amount)).toBe(true);
  });

  it('findByUserId returns all transactions for a user', async () => {
    await repo.create({ userId: userId1, accountId: accountId1, amount: 500, type: 'EXPENSE', date: baseDate });
    await repo.create({ userId: userId1, accountId: accountId1, amount: 2000, type: 'INCOME', date: baseDate });
    const txs = await repo.findByUserId(userId1);
    expect(txs).toHaveLength(2);
  });

  it('findByAccountId filters by accountId correctly', async () => {
    await repo.create({ userId: userId1, accountId: accountId1, amount: 100, type: 'EXPENSE', date: baseDate });
    await repo.create({ userId: userId1, accountId: accountId2, amount: 200, type: 'EXPENSE', date: baseDate });
    const txsForAccount1 = await repo.findByAccountId(accountId1);
    expect(txsForAccount1).toHaveLength(1);
    expect(txsForAccount1[0].amount).toBe(100);
    const txsForAccount2 = await repo.findByAccountId(accountId2);
    expect(txsForAccount2).toHaveLength(1);
    expect(txsForAccount2[0].amount).toBe(200);
  });

  it('deletes a transaction and findById returns null', async () => {
    const tx = await repo.create({
      userId: userId1,
      accountId: accountId1,
      amount: 300,
      type: 'INCOME',
      date: baseDate,
    });
    await repo.delete(tx.id);
    const found = await repo.findById(tx.id);
    expect(found).toBeNull();
  });

  it('findByUserId returns empty array when user has no transactions', async () => {
    const txs = await repo.findByUserId(userId2);
    expect(txs).toEqual([]);
  });

  it('findByUserIdAndDateRange returns transactions within range (exclusive end)', async () => {
    const jan10 = new Date('2026-01-10');
    const jan20 = new Date('2026-01-20');
    const jan25 = new Date('2026-01-25');
    await repo.create({ userId: userId1, accountId: accountId1, amount: 100, type: 'EXPENSE', date: jan10 });
    await repo.create({ userId: userId1, accountId: accountId1, amount: 200, type: 'EXPENSE', date: jan20 });
    await repo.create({ userId: userId1, accountId: accountId1, amount: 300, type: 'INCOME', date: jan25 });
    const results = await repo.findByUserIdAndDateRange(userId1, jan10, jan25);
    expect(results).toHaveLength(2);
    expect(results.map(t => t.amount).sort()).toEqual([100, 200]);
  });

  it('findByUserIdAndDateRange returns [] when no transactions in range', async () => {
    const feb1 = new Date('2026-02-01');
    const feb28 = new Date('2026-02-28');
    const results = await repo.findByUserIdAndDateRange(userId1, feb1, feb28);
    expect(results).toEqual([]);
  });

  it('findByUserIdAndDateRange: transaction at start is included, at end is excluded', async () => {
    const start = new Date('2026-03-01');
    const end = new Date('2026-03-31');
    await repo.create({ userId: userId1, accountId: accountId1, amount: 500, type: 'EXPENSE', date: start });
    await repo.create({ userId: userId1, accountId: accountId1, amount: 600, type: 'INCOME', date: end });
    const results = await repo.findByUserIdAndDateRange(userId1, start, end);
    expect(results).toHaveLength(1);
    expect(results[0].amount).toBe(500);
  });

  it('findByUserIdAndDateRange with start === end returns []', async () => {
    const same = new Date('2026-04-15');
    await repo.create({ userId: userId1, accountId: accountId1, amount: 999, type: 'EXPENSE', date: same });
    const results = await repo.findByUserIdAndDateRange(userId1, same, same);
    expect(results).toEqual([]);
  });

  it('update modifies transaction fields and returns updated transaction', async () => {
    const tx = await repo.create({
      userId: userId1,
      accountId: accountId1,
      amount: 1000,
      type: 'EXPENSE',
      date: baseDate,
      description: 'original',
    });
    const updated = await repo.update(tx.id, { amount: 2000, description: 'updated' });
    expect(updated).not.toBeNull();
    expect(updated!.amount).toBe(2000);
    expect(updated!.description).toBe('updated');
    expect(updated!.type).toBe('EXPENSE');
  });

  it('update with non-existent id returns null', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const result = await repo.update(fakeId, { amount: 100 });
    expect(result).toBeNull();
  });
});
