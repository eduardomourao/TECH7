export function validateEmail(email) {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validatePhone(phone) {
  if (!phone || typeof phone !== "string") return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 11;
}

export function validateCep(cep) {
  if (!cep || typeof cep !== "string") return false;
  return /^\d{5}-?\d{3}$/.test(cep.trim());
}

export function sanitizeString(value, maxLen = 500) {
  if (!value || typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export function toCents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromCents(cents) {
  const n = Number(cents);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : "0.00";
}
