import { IUserRepository, User, CreateUserDto } from '@financas/shared';
import { UserModel } from '../db/UserModel.js';

function toPlain(doc: any): User {
  return {
    id: doc._id.toString(),
    email: doc.email,
    passwordHash: doc.passwordHash,
    createdAt: doc.createdAt,
  };
}

export class MongoUserRepository implements IUserRepository {
  async create(data: CreateUserDto): Promise<User> {
    const doc = await UserModel.create(data);
    return toPlain(doc);
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await UserModel.findOne({ email });
    return doc ? toPlain(doc) : null;
  }

  async findById(id: string): Promise<User | null> {
    const doc = await UserModel.findById(id);
    return doc ? toPlain(doc) : null;
  }
}
