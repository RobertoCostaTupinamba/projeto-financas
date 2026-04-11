// ioredis exports Redis as a named export — use `import { Redis } from 'ioredis'`
// (ioredis ships CJS with __esModule:true; named export is more explicit and avoids
// default-import interop ambiguity under NodeNext moduleResolution)
import { Redis } from 'ioredis';

let _client: Redis | null = null;

export function connectRedis(uri: string): void {
  _client = new Redis(uri, { lazyConnect: false });
}

export async function disconnectRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}

export function getRedisClient(): Redis {
  if (!_client) {
    throw new Error('Redis client not initialized — call connectRedis() first');
  }
  return _client;
}
