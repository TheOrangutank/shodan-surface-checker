import { NextRequest, NextResponse } from "next/server";
import { ShodanError, shodanGetDomain } from "@/lib/shodan";
import {
  rateLimitError,
  shodanErrorResponse,
  unexpectedErrorResponse,
  validationError,
} from "@/lib/api-errors";
import { checkRateLimit, checkSharedRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sanitizeDomainInput } from "@/lib/validation";
import { authErrorResponse, requireSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(request, RATE_LIMITS.domain);
  if (!rateLimit.allowed) {
    return rateLimitError(rateLimit.retryAfterSeconds);
  }

  const domain = sanitizeDomainInput(request.nextUrl.searchParams.get("domain"));
  if (!domain.ok) {
    return validationError(domain.error);
  }

  try {
    const session = await requireSession(request);
    const sharedLimit = await checkSharedRateLimit(`quick-domain:${session.id}`, 10, 60);
    if (!sharedLimit.allowed) {
      return rateLimitError(sharedLimit.retryAfterSeconds);
    }
    const data = await shodanGetDomain(domain.value);
    return NextResponse.json(data);
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
