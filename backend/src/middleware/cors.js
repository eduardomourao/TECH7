export function corsMiddleware(req, res, next) {
  const normalizeOrigin = (value) => String(value || "").trim().replace(/\/+$/, "");
  const origin = normalizeOrigin(req.headers.origin);
  const envOrigins = String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  const devOrigins = process.env.NODE_ENV === "production" ? [] : [
    "http://localhost:5500",
    "http://localhost:3000",
    "http://127.0.0.1:5500",
  ];
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    ...envOrigins,
    ...devOrigins,
  ].map(normalizeOrigin).filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.includes(origin)) return res.sendStatus(403);
    return res.sendStatus(204);
  }

  next();
}
