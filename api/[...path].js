import { createApp, runStartupChecks } from "../server/app.js";

runStartupChecks();

// Vercel may invoke this catch-all function with either the original /api/*
// URL or the stripped catch-all path. Supporting both keeps local and Vercel
// routing aligned without changing frontend fetch calls.
const app = createApp({
  serveStatic: false,
  apiPrefixes: ["/api", ""]
});

export default app;
