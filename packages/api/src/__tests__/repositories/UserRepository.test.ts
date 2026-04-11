import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../infrastructure/db/connection.js';
import { MongoUserRepository } from '../../infrastructure/repositories/MongoUserRepository.js';

const TEST_URI = 'mongodb://localhost:27017/financas_test';
const repo = new MongoUserRepository();

beforeAll(async () => { await connectDB(TEST_URI); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await disconnectDB(); });
beforeEach(async () => { await mongoose.connection.collection('users').drop().catch(() => {}); });

describe('MongoUserRepository', () => {
  it('creates a user and retrieves it by id', async () => {
    const user = await repo.create({ email: 'test@example.com', passwordHash: 'hash123' });
    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
    const found = await repo.findById(user.id);
    expect(found).not.toBeNull();
    expect(found!.email).toBe('test@example.com');
  });

  it('finds a user by email', async () => {
    await repo.create({ email: 'find@example.com', passwordHash: 'hash' });
    const found = await repo.findByEmail('find@example.com');
    expect(found).not.toBeNull();
    expect(found!.email).toBe('find@example.com');
  });

  it('returns null for unknown email', async () => {
    const found = await repo.findByEmail('nobody@example.com');
    expect(found).toBeNull();
  });

  it('returns null for unknown id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const found = await repo.findById(fakeId);
    expect(found).toBeNull();
  });
});
