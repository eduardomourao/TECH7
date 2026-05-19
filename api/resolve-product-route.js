import path from "node:path";

import { resolveShortCatalogRoute } from "../server/lib/catalog_routes.js";

const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : process.cwd();

function withSearch(destination, requestUrl) {
  const url = new URL(requestUrl, "https://tech-7.vercel.app");
  url.searchParams.delete("section");
  url.searchParams.delete("slug");
  return `${destination}${url.searchParams.size ? `?${url.searchParams}` : ""}`;
}

export default function handler(req, res) {
  const url = new URL(req.url, "https://tech-7.vercel.app");
  const destination = resolveShortCatalogRoute({
    staticDir: STATIC_DIR,
    section: url.searchParams.get("section"),
    slug: url.searchParams.get("slug")
  });

  if (!destination) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  res.statusCode = 307;
  res.setHeader("Location", withSearch(destination, req.url));
  res.end();
}
