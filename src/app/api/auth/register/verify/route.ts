import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import {
  authErrorResponse,
  consumeChallenge,
  getAuthConfig,
  passkeyRegistrationAllowed,
  requireSetupToken,
  saveCredential,
} from "@/lib/auth";
import { rateLimitError } from "@/lib/api-errors";
import { enforceAuthRateLimit } from "@/lib/webauthn";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceAuthRateLimit(request, "register");
    if (rateLimit) return rateLimitError(rateLimit.retryAfterSeconds);

    requireSetupToken(request);
    if (!(await passkeyRegistrationAllowed())) {
      return NextResponse.json({ error: "Passkey registration is already complete." }, { status: 403 });
    }

    const response = (await request.json()) as RegistrationResponseJSON;
    const { appOrigin, rpId } = getAuthConfig();
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: async (challenge) => {
        await consumeChallenge("registration", challenge);
        return true;
      },
      expectedOrigin: appOrigin,
      expectedRPID: rpId,
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Passkey registration failed." }, { status: 400 });
    }

    await saveCredential(verification.registrationInfo.credential);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err);
  }
}
