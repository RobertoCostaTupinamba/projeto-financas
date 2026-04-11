import { buildServer } from "./server.js";
import { registerRoutes } from "./app.js";

const app = buildServer();

await registerRoutes(app);

try {
  await app.listen({ port: 3001, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
