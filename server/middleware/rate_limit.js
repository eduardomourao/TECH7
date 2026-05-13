const buckets = new Map();

function nowMs() {
  return Date.now();
}

export function rateLimit(opts = {}) {
  const windowMs = Math.max(1000, Number(opts.windowMs || 60_000));
  const limit = Math.max(1, Number(opts.limit || 60));
  const keyPrefix = String(opts.keyPrefix || "global");

  return function limiter(req, res, next) {
    const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
    const key = `${keyPrefix}:${ip}`;
    const current = buckets.get(key);
    const ts = nowMs();

    if (!current || ts > current.resetAt) {
      buckets.set(key, { count: 1, resetAt: ts + windowMs });
      return next();
    }

    if (current.count >= limit) {
      const retrySec = Math.max(1, Math.ceil((current.resetAt - ts) / 1000));
      res.setHeader("Retry-After", String(retrySec));
      return res.status(429).json({ error: "rate_limited", retryAfterSeconds: retrySec });
    }

    current.count += 1;
    return next();
  };
}

