import IORedis from "ioredis";

export function createRedisConnection(): IORedis {
  return new IORedis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    // Upstash (and most managed Redis) requires TLS - local dev Redis does
    // not support it, so this is opt-in via env, never assumed either way.
    ...(process.env.REDIS_TLS === "true" ? { tls: {} } : {}),
  });
}
