import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth";
import { rateLimitError } from "@/lib/api-errors";
import { createAuthenticationOptions, enforceAuthRateLimit } from "@/lib/webauthn";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceAuthRateLimit(request, "login");
    if (rateLimit) return rateLimitError(rateLimit.retryAfterSeconds);

    const options = await createAuthenticationOptions();
    return NextResponse.json(options);
  } catch (err) {
    return authErrorResponse(err);
  }
}
