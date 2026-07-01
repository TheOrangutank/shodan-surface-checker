export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const MAX_DOMAIN_LENGTH = 253;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function sanitizeDomainInput(value: string | null): ValidationResult<string> {
  const domain = value?.trim().toLowerCase().replace(/\.$/, "") ?? "";

  if (!domain) {
    return { ok: false, error: "Missing ?domain= parameter" };
  }

  if (domain.length > MAX_DOMAIN_LENGTH) {
    return { ok: false, error: "Domain is too long" };
  }

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !DOMAIN_LABEL.test(label))) {
    return { ok: false, error: "Invalid domain format" };
  }

  return { ok: true, value: domain };
}

export function sanitizeIpv4Input(value: string | null): ValidationResult<string> {
  const ip = value?.trim() ?? "";

  if (!ip) {
    return { ok: false, error: "Missing ?ip= parameter" };
  }

  const octets = ip.split(".");
  if (octets.length !== 4) {
    return { ok: false, error: "Invalid IPv4 address" };
  }

  const normalized = [];
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) {
      return { ok: false, error: "Invalid IPv4 address" };
    }

    const number = Number(octet);
    if (number < 0 || number > 255) {
      return { ok: false, error: "Invalid IPv4 address" };
    }

    normalized.push(String(number));
  }

  return { ok: true, value: normalized.join(".") };
}
