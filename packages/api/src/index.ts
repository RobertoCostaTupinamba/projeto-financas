import { buildServer } from "./server.js";
import { registerRoutes } from "./app.js";
import { connectDB, disconnectDB } from "./infrastructure/db/connection.js";
import {
  connectRedis,
  disconnectRedis,
  getRedisClient,
} from "./infrastructure/redis/client.js";
import { MongoUserRepository } from "./infrastructure/repositories/MongoUserRepository.js";
import { MongoAccountRepository } from "./infrastructure/repositories/MongoAccountRepository.js";
import { MongoCategoryRepository } from "./infrastructure/repositories/MongoCategoryRepository.js";

const MONGODB_URI =
  process.env["MONGODB_URI"] ?? "mongodb://localhost:27017/financas";
const REDIS_URI = process.env["REDIS_URI"] ?? "redis://localhost:6379";

// Connect backing stores before accepting traffic
await connectDB(MONGODB_URI);
await connectRedis(REDIS_URI);

const userRepo = new MongoUserRepository();
const accountRepo = new MongoAccountRepository();
const categoryRepo = new MongoCategoryRepository();
const redis = getRedisClient();

const app = await buildServer();

await registerRoutes(app, { userRepo, redis, accountRepo, categoryRepo });

// Graceful shutdown — release connections on SIGINT (Ctrl-C)
process.on("SIGINT", async () => {
  app.log.info("SIGINT received — shutting down");
  await app.close();
  await disconnectDB();
  await disconnectRedis();
  process.exit(0);
});

try {
  await app.listen({ port: 3001, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  await disconnectDB();
  await disconnectRedis();
  process.exit(1);
}
