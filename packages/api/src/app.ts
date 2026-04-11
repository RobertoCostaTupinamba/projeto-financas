import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { IUserRepository } from "@financas/shared";
import authRoutes from "./routes/auth.js";

interface RouteDeps {
  userRepo: IUserRepository;
  redis: Redis;
}

export async function registerRoutes(
  app: FastifyInstance,
  deps?: RouteDeps,
): Promise<void> {
  app.get("/health", async (_request, _reply) => {
    return { status: "ok" };
  });

  // Auth routes are only registered when real dependencies are provided.
  // This keeps server.test.ts working (calls registerRoutes(app) with no deps).
  if (deps) {
    await app.register(authRoutes, deps);
  }
}
