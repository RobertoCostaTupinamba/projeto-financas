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
});
