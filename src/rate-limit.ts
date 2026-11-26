export interface RateLimiter {
  allow(key: string): boolean;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    allow(key) {
      const now = Date.now();
      for (const [other, times] of hits) {
        const recent = times.filter((t) => now - t < windowMs);
        if (recent.length === 0) hits.delete(other);
        else hits.set(other, recent);
      }
      const recent = hits.get(key) ?? [];
      if (recent.length >= limit) return false;
      hits.set(key, [...recent, now]);
      return true;
    },
  };
}
