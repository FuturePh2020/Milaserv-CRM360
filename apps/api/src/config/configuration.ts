export default () => ({
  timezone: process.env.APP_TIMEZONE ?? "Africa/Cairo",
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    // Upstash (and most managed Redis) requires TLS - local dev Redis does
    // not support it, so this is opt-in via env, never assumed either way.
    tls: process.env.REDIS_TLS === "true",
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshTtl: process.env.JWT_REFRESH_TTL ?? "7d",
    lockoutMaxAttempts: Number(process.env.AUTH_LOCKOUT_MAX_ATTEMPTS ?? 5),
    lockoutWindowMinutes: Number(process.env.AUTH_LOCKOUT_WINDOW_MINUTES ?? 15),
    lockoutDurationMinutes: Number(process.env.AUTH_LOCKOUT_DURATION_MINUTES ?? 15),
  },
  uploads: {
    maxFileSizeMb: Number(process.env.UPLOAD_MAX_FILE_SIZE_MB ?? 50),
    storagePath: process.env.UPLOAD_STORAGE_PATH ?? "./storage/uploads",
    allowedMimeTypes: (process.env.UPLOAD_ALLOWED_MIME_TYPES ?? "").split(",").filter(Boolean),
  },
  activity: {
    // Env-var fallback only - the effective threshold is Admin-configurable
    // at runtime via Settings (browserIdleThresholdSeconds), see
    // ActivityService.getThresholdSeconds.
    idleBreakThresholdSecondsDefault: Number(process.env.IDLE_BREAK_THRESHOLD_SECONDS ?? 300),
  },
  cdr: {
    defaultSourceTimezone: process.env.CDR_DEFAULT_SOURCE_TIMEZONE ?? "Asia/Riyadh",
  },
  dashboards: {
    // Spec 18.1 calls for an "Agents over break allowance" card but never states
    // the actual threshold - this default is a placeholder pending a Team Leader
    // decision, not a value taken from the spec.
    breakAllowanceMinutes: Number(process.env.DASHBOARD_BREAK_ALLOWANCE_MINUTES ?? 60),
    overviewCacheTtlSeconds: Number(process.env.DASHBOARD_OVERVIEW_CACHE_TTL_SECONDS ?? 10),
  },
});
