// Tiny in-memory sliding-window rate limiter (single pm2 process → fine).
// Used to throttle the public ticket endpoints against enumeration / abuse.

const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
  }
  return true;
}

// Client IP behind Caddy (sets X-Forwarded-For); falls back to the adapter's value.
export function clientIp(request: Request, clientAddress?: string): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return clientAddress || 'unknown';
}
