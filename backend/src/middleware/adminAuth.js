const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

export function adminAuth(req, res, next) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing_token" });
  }
  const token = header.slice(7);
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "invalid_token" });
  }
  req.admin = { token: true };
  return next();
}
