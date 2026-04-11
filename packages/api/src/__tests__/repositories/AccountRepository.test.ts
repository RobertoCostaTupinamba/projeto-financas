import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../infrastructure/db/connection.js';
import { MongoAccountRepository } from '../../infrastructure/repositories/MongoAccountRepository.js';

const TEST_URI = 'mongodb://localhost:27017/financas_test';
const repo = new MongoAccountRepository();
const userId1 = new mongoose.Types.ObjectId().toString();
const userId2 = new mongoose.Types.ObjectId().toString();

beforeAll(async () => { await connectDB(TEST_URI); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await disconnectDB(); });
beforeEach(async () => { await mongoose.connection.collection('accounts').drop().catch(() => {}); });

describe('MongoAccountRepository', () => {
  it('creates a CHECKING account and retrieves it by id', async () => {
    const account = await repo.create({ userId: userId1, name: 'Conta Corrente', type: 'CHECKING' });
    expect(account.id).toBeDefined();
    expect(account.name).toBe('Conta Corrente');
    expect(account.type).toBe('CHECKING');
    const found = await repo.findById(account.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Conta Corrente');
    expect(found!.type).toBe('CHECKING');
  });

  it('findByUserId returns all accounts for a user', async () => {
    await repo.create({ userId: userId1, name: 'Conta A', type: 'CHECKING' });
    await repo.create({ userId: userId1, name: 'Conta B', type: 'SAVINGS' });
    const accounts = await repo.findByUserId(userId1);
    expect(accounts).toHaveLength(2);
    const names = accounts.map((a) => a.name);
    expect(names).toContain('Conta A');
    expect(names).toContain('Conta B');
  });

  it('deletes an account and findById returns null', async () => {
    const account = await repo.create({ userId: userId1, name: 'Para Deletar', type: 'SAVINGS' });
    await repo.delete(account.id);
    const found = await repo.findById(account.id);
    expect(found).toBeNull();
  });

  it('creates a CREDIT_CARD account with closingDay and dueDay', async () => {
    const account = await repo.create({
      userId: userId1,
      name: 'Cartão de Crédito',
      type: 'CREDIT_CARD',
      closingDay: 25,
      dueDay: 5,
    });
    expect(account.type).toBe('CREDIT_CARD');
    expect(account.closingDay).toBe(25);
    expect(account.dueDay).toBe(5);
    const found = await repo.findById(account.id);
    expect(found!.closingDay).toBe(25);
    expect(found!.dueDay).toBe(5);
  });

  it('findByUserId returns empty array when no accounts exist for user', async () => {
    const accounts = await repo.findByUserId(userId2);
    expect(accounts).toEqual([]);
  });
});
