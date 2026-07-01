import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import {
  authErrorResponse,
  consumeChallenge,
  createSession,
  getAuthConfig,
  getCredential,
  setSessionCookies,
  toWebAuthnCredential,
  updateCredentialCounter,
} from "@/lib/auth";
import { rateLimitError } from "@/lib/api-errors";
import { enforceAuthRateLimit } from "@/lib/webauthn";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await enforceAuthRateLimit(request, "login");
    if (rateLimit) return rateLimitError(rateLimit.retryAfterSeconds);

    const response = (await request.json()) as AuthenticationResponseJSON;
    const credential = await getCredential(response.id);
    const { appOrigin, rpId } = getAuthConfig();
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: async (challenge) => {
        await consumeChallenge("authentication", challenge);
        return true;
      },
      expectedOrigin: appOrigin,
      expectedRPID: rpId,
      credential: toWebAuthnCredential(credential),
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Passkey login failed." }, { status: 401 });
    }

    await updateCredentialCounter(response.id, verification.authenticationInfo.newCounter);

    const { sessionToken, csrfToken, expiresAt } = await createSession(request);
    const res = NextResponse.json({ ok: true, csrfToken });
    setSessionCookies(res, sessionToken, csrfToken, expiresAt);
    return res;
  } catch (err) {
    return authErrorResponse(err);
  }
}
