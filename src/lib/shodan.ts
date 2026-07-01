export { getPortRisk, summarizePorts, RISK_COLORS } from "@/lib/port-risk";

const SHODAN_BASE = "https://api.shodan.io";

export type ShodanErrorCode =
  | "missing_api_key"
  | "upstream_error"
  | "upstream_rate_limited";

export class ShodanError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: ShodanErrorCode = "upstream_error",
  ) {
    super(message);
    this.name = "ShodanError";
  }
}

function getApiKey(): string {
  const key = process.env.SHODAN_API_KEY;
  if (!key || key === "your_shodan_api_key_here") {
    throw new ShodanError(
      "SHODAN_API_KEY is not set. Copy .env.example to .env.local and add your key.",
      500,
      "missing_api_key",
    );
  }
  return key;
}

async function shodanFetch<T>(path: string): Promise<T> {
  const url = `${SHODAN_BASE}${path}${path.includes("?") ? "&" : "?"}key=${getApiKey()}`;
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    let message = `Shodan API error (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // use default message
    }
    throw new ShodanError(
      message,
      res.status,
      res.status === 429 ? "upstream_rate_limited" : "upstream_error",
    );
  }

  return res.json() as Promise<T>;
}

export function shodanGetProfile() {
  return shodanFetch<import("@/types/shodan").ShodanProfile>("/account/profile");
}

export function shodanGetDomain(domain: string) {
  return shodanFetch<import("@/types/shodan").ShodanDomainInfo>(
    `/dns/domain/${encodeURIComponent(domain)}`,
  );
}

export function shodanGetHost(ip: string) {
  return shodanFetch<import("@/types/shodan").ShodanHostInfo>(
    `/shodan/host/${encodeURIComponent(ip)}?minify=false`,
  );
}
