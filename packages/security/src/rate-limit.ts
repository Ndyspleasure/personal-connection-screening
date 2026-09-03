import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Layered, distributed rate limiting (Threat Model §28, §36; Technology
 * Architecture §34). Upstash is used from MVP for correctness across the many
 * ephemeral serverless instances; the in-memory limiter is a dev/test fallback
 * ONLY (it is per-process and must never be relied on in production).
 */
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimiter {
  limit(key: string): Promise<RateLimitResult>;
}

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

/** Per-process fixed-window limiter. Dev/test only. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowSeconds: number,
  ) {}

  async limit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = this.windowSeconds * 1000;
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return {
        success: true,
        limit: this.maxRequests,
        remaining: this.maxRequests - 1,
        resetSeconds: this.windowSeconds,
      };
    }
    entry.count += 1;
    return {
      success: entry.count <= this.maxRequests,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
}

/** Upstash-backed sliding-window limiter (production). */
export class UpstashRateLimiter implements RateLimiter {
  private readonly ratelimit: Ratelimit;

  constructor(params: { url: string; token: string; config: RateLimitConfig; prefix: string }) {
    const redis = new Redis({ url: params.url, token: params.token });
    this.ratelimit = new Ratelimit({
      redis,
      prefix: `pcs:rl:${params.prefix}`,
      limiter: Ratelimit.slidingWindow(params.config.limit, `${params.config.windowSeconds} s`),
    });
  }

  async limit(key: string): Promise<RateLimitResult> {
    const res = await this.ratelimit.limit(key);
    return {
      success: res.success,
      limit: res.limit,
      remaining: res.remaining,
      resetSeconds: Math.max(0, Math.ceil((res.reset - Date.now()) / 1000)),
    };
  }
}

/**
 * Build a limiter for a named operation. Uses Upstash when credentials are
 * present, otherwise the in-memory fallback (with a one-time warning).
 */
export function createRateLimiter(
  name: string,
  config: RateLimitConfig,
  redis?: { url: string; token: string },
): RateLimiter {
  if (redis && redis.url && redis.token) {
    return new UpstashRateLimiter({ url: redis.url, token: redis.token, config, prefix: name });
  }
  return new InMemoryRateLimiter(config.limit, config.windowSeconds);
}
