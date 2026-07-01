import type { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";

interface RateLimitOptions {
  limit: number;
  windowMs: number;
  keyPrefix: string;
}

interface RateLimitState {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const buckets = new Map<string, RateLimitState>();

export const RATE_LIMITS = {
  profile: { limit: 30, windowMs: 60_000, keyPrefix: "profile" },
  domain: { limit: 10, windowMs: 60_000, keyPrefix: "domain" },
  host: { limit: 10, windowMs: 60_000, keyPrefix: "host" },
  assets: { limit: 60, windowMs: 60_000, keyPrefix: "assets" },
  assetRefresh: { limit: 5, windowMs: 60_000, keyPrefix: "asset-refresh" },
} satisfies Record<string, RateLimitOptions>;

export function checkRateLimit(
  request: NextRequest,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const clientIp = getClientIp(request);
  const key = `${options.keyPrefix}:${clientIp}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function checkSharedRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const row = await queryOne<{ allowed: boolean; retry_after: number }>(
    "select allowed, retry_after from check_rate_limit($1, $2, $3)",
    [key, limit, windowSeconds],
  ).catch(() => null);

  if (!row) {
    return { allowed: false, retryAfterSeconds: 60 };
  }

  return {
    allowed: Boolean(row.allowed),
    retryAfterSeconds: Number(row.retry_after ?? 0),
  };
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || "unknown";
}
