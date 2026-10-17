/**
 * Production Arbiter API origin. This is the single source of truth for the
 * default URL; everything else goes through resolveApiUrl() in config.ts.
 *
 * Override per-invocation with --api-url, or persistently with ARBITER_API_URL
 * (e.g. http://localhost:8000 for a self-hosted gateway).
 */
export const DEFAULT_API_URL = 'https://api.arbiterai.dev'
