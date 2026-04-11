import bcrypt from 'bcryptjs';
import type { IUserRepository, User } from '@financas/shared';

export interface RegisterResult {
  id: string;
  email: string;
  createdAt: Date;
}

export class RegisterUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(email: string, password: string): Promise<RegisterResult> {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw { code: 'EMAIL_EXISTS' } as const;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user: User = await this.userRepo.create({ email, passwordHash });

    // Never include passwordHash in the return value
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  }
}
