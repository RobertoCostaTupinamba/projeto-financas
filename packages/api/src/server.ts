import { randomUUID } from "node:crypto";
import Fastify from "fastify";

export function buildServer() {
  const app = Fastify({
    logger: {
      level: "info",
    },
    genReqId: () => randomUUID(),
  });

  return app;
}
