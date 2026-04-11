import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cookiePlugin from "@fastify/cookie";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: "info",
    },
    genReqId: () => randomUUID(),
  });

  // Register cookie plugin before any route registration
  await app.register(cookiePlugin);

  return app;
}
