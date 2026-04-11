import { jwtVerify } from 'jose';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Declaration merge — adds `user` to every FastifyRequest
declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email: string };
  }
}

/**
 * Returns a Fastify preHandler that validates Bearer JWTs.
 * Injects `request.user` on success; returns 401 on missing/invalid token.
 */
export function makeVerifyJwt(secret: string) {
  const key = new TextEncoder().encode(secret);

  return async function verifyJwt(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.slice(7); // strip "Bearer "
    try {
      const { payload } = await jwtVerify(token, key);
      request.user = {
        id: payload.sub as string,
        email: payload['email'] as string,
      };
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
  };
}
