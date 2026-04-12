import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { IUserRepository, IAccountRepository, ICategoryRepository, ITransactionRepository } from "@financas/shared";
import authRoutes from "./routes/auth.js";
import accountRoutes from "./routes/accounts.js";
import categoryRoutes from "./routes/categories.js";
import transactionRoutes from "./routes/transactions.js";
import importRoutes from "./routes/import.js";

interface RouteDeps {
  userRepo: IUserRepository;
  redis: Redis;
  accountRepo: IAccountRepository;
  categoryRepo: ICategoryRepository;
  transactionRepo: ITransactionRepository;
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
    await app.register(accountRoutes, { accountRepo: deps.accountRepo });
    await app.register(categoryRoutes, { categoryRepo: deps.categoryRepo });
    await app.register(transactionRoutes, { transactionRepo: deps.transactionRepo, categoryRepo: deps.categoryRepo });
    await app.register(importRoutes, { transactionRepo: deps.transactionRepo });
  }
}
