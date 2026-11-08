/**
 * In-memory fixed-window rate limiter. Sufficient for the single-instance MVP;
 * replace with a shared store when running multiple application instances.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns whether the request is allowed and how long until the window resets. */
  check(key: string): { allowed: boolean; retryAfterMs: number; remaining: number } {
    const current = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      this.buckets.set(key, { count: 1, resetAt: current + this.windowMs });
      this.prune(current);
      return { allowed: true, retryAfterMs: 0, remaining: this.limit - 1 };
    }
    if (bucket.count >= this.limit) {
      return { allowed: false, retryAfterMs: bucket.resetAt - current, remaining: 0 };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterMs: 0, remaining: this.limit - bucket.count };
  }

  reset(key: string) {
    this.buckets.delete(key);
  }

  private prune(current: number) {
    if (this.buckets.size < 1000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= current) this.buckets.delete(key);
    }
  }
}

const globalForLimiter = globalThis as unknown as { loginLimiter?: RateLimiter };

/** 10 login attempts per 15 minutes per client key. */
export const loginRateLimiter =
  globalForLimiter.loginLimiter ?? (globalForLimiter.loginLimiter = new RateLimiter(10, 15 * 60 * 1000));
