import { NextRequest, NextResponse } from "next/server";
import { ShodanError, shodanGetProfile } from "@/lib/shodan";
import {
  rateLimitError,
  shodanErrorResponse,
  unexpectedErrorResponse,
} from "@/lib/api-errors";
import { checkRateLimit, checkSharedRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { authErrorResponse, requireSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(request, RATE_LIMITS.profile);
  if (!rateLimit.allowed) {
    return rateLimitError(rateLimit.retryAfterSeconds);
  }

  try {
    const session = await requireSession(request);
    const sharedLimit = await checkSharedRateLimit(`profile:${session.id}`, 30, 60);
    if (!sharedLimit.allowed) {
      return rateLimitError(sharedLimit.retryAfterSeconds);
    }
    const profile = await shodanGetProfile();
    return NextResponse.json(profile);
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
