import { NextRequest, NextResponse } from "next/server";
import { passkeyRegistrationAllowed, requireSetupToken, authErrorResponse } from "@/lib/auth";
import { createRegistrationOptions, enforceAuthRateLimit } from "@/lib/webauthn";
import { rateLimitError } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceAuthRateLimit(request, "register");
    if (rateLimit) return rateLimitError(rateLimit.retryAfterSeconds);

    requireSetupToken(request);
    if (!(await passkeyRegistrationAllowed())) {
      return NextResponse.json({ error: "Passkey registration is already complete." }, { status: 403 });
    }

    const options = await createRegistrationOptions();
    return NextResponse.json(options);
  } catch (err) {
    return authErrorResponse(err);
  }
}
