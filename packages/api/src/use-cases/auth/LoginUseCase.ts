import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { IUserRepository } from '@financas/shared';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod';
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

export class LoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly redis: Redis,
  ) {}

  async execute(email: string, password: string): Promise<LoginResult> {
    const user = await this.userRepo.findByEmail(email);
    // Same error for unknown email and wrong password — don't leak user existence
    if (!user) {
      throw { code: 'INVALID_CREDENTIALS' } as const;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw { code: 'INVALID_CREDENTIALS' } as const;
    }

    const key = new TextEncoder().encode(JWT_SECRET);
    const accessToken = await new SignJWT({ sub: user.id, email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(key);

    const refreshToken = randomUUID();
    await this.redis.set(`refresh:${refreshToken}`, user.id, 'EX', REFRESH_TTL_SECONDS);

    return { accessToken, refreshToken };
  }
}
