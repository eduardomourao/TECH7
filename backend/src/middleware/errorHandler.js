export function errorHandler(err, req, res, _next) {
  const status = err.statusCode || err.status || 500;
  const message = status === 500 ? "Internal server error" : err.message;

  if (status === 500) {
    console.error("[error]", err.stack || err.message);
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === "development" && { detail: err.message }),
  });
}

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}
