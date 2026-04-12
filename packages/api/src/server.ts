import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cookiePlugin from "@fastify/cookie";
import multipartPlugin from "@fastify/multipart";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: "info",
    },
    genReqId: () => randomUUID(),
  });

  // Register cookie plugin before any route registration
  await app.register(cookiePlugin);
  // Register multipart plugin for file upload support
  await app.register(multipartPlugin);

  return app;
}
