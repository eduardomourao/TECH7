import crypto from "node:crypto";

export function newId(prefix) {
  const rand = crypto.randomBytes(16).toString("hex");
  return `${prefix}_${rand}`;
}

