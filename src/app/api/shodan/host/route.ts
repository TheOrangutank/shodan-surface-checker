import { NextRequest, NextResponse } from "next/server";
import { ShodanError, shodanGetHost, summarizePorts } from "@/lib/shodan";
import {
  rateLimitError,
  shodanErrorResponse,
  unexpectedErrorResponse,
  validationError,
} from "@/lib/api-errors";
import { checkRateLimit, checkSharedRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sanitizeIpv4Input } from "@/lib/validation";
import { authErrorResponse, requireSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(request, RATE_LIMITS.host);
  if (!rateLimit.allowed) {
    return rateLimitError(rateLimit.retryAfterSeconds);
  }

  const ip = sanitizeIpv4Input(request.nextUrl.searchParams.get("ip"));
  if (!ip.ok) {
    return validationError(ip.error);
  }

  try {
    const session = await requireSession(request);
    const sharedLimit = await checkSharedRateLimit(`quick-host:${session.id}`, 10, 60);
    if (!sharedLimit.allowed) {
      return rateLimitError(sharedLimit.retryAfterSeconds);
    }
    const host = await shodanGetHost(ip.value);
    const summary = summarizePorts(host.ports ?? []);
    return NextResponse.json({ host, summary });
  } catch (err) {
    if (err instanceof Error && err.name === "AuthError") {
      return authErrorResponse(err);
    }

    if (err instanceof ShodanError) {
      return shodanErrorResponse(err);
    }
    return unexpectedErrorResponse(err);
  }
}
