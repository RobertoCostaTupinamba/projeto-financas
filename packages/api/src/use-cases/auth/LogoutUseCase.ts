import type { Redis } from 'ioredis';

export class LogoutUseCase {
  constructor(private readonly redis: Redis) {}

  async execute(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    // redis.del returns 0 when key doesn't exist — never throws
    await this.redis.del(`refresh:${refreshToken}`);
  }
}
