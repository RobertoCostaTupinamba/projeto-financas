import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { IUserRepository } from '@financas/shared';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod';
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export class RefreshUseCase {
  constructor(
    private readonly redis: Redis,
    private readonly userRepo: IUserRepository,
  ) {}

  async execute(refreshToken: string): Promise<RefreshResult> {
    // GETDEL is atomic — consume the old token in a single round-trip (prevents replay)
    const userId = await this.redis.getdel(`refresh:${refreshToken}`);
    if (!userId) {
      throw { code: 'INVALID_REFRESH_TOKEN' } as const;
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw { code: 'INVALID_REFRESH_TOKEN' } as const;
    }

    const key = new TextEncoder().encode(JWT_SECRET);
    const accessToken = await new SignJWT({ sub: user.id, email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(key);

    const newRefreshToken = randomUUID();
    await this.redis.set(`refresh:${newRefreshToken}`, userId, 'EX', REFRESH_TTL_SECONDS);

    return { accessToken, refreshToken: newRefreshToken };
  }
}
