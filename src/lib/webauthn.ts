import type { NextRequest } from "next/server";
import { generateAuthenticationOptions, generateRegistrationOptions } from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  getAuthConfig,
  getClientIp,
  listCredentials,
  saveChallenge,
} from "@/lib/auth";
import { checkSharedRateLimit } from "@/lib/rate-limit";

export async function enforceAuthRateLimit(request: NextRequest, action: string) {
  const result = await checkSharedRateLimit(
    `auth:${action}:${getClientIp(request)}`,
    action === "register" ? 3 : 10,
    60,
  );

  if (!result.allowed) {
    return result;
  }

  return null;
}

export async function createRegistrationOptions() {
  const { rpName, rpId } = getAuthConfig();
  const credentials = await listCredentials();
  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userName: "admin",
    userDisplayName: "Admin",
    userID: new TextEncoder().encode("single-admin"),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    excludeCredentials: credentials.map((credential) => ({
      id: credential.credential_id,
      transports: credential.transports ?? undefined,
    })),
  });

  await saveChallenge("registration", options.challenge);
  return options;
}

export async function createAuthenticationOptions() {
  const { rpId } = getAuthConfig();
  const credentials = await listCredentials();
  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: "required",
    allowCredentials: credentials.map((credential) => ({
      id: credential.credential_id,
      transports: credential.transports ?? undefined,
    })),
  });

  await saveChallenge("authentication", options.challenge);
  return options;
}

export function extractRegistrationChallenge(response: RegistrationResponseJSON) {
  return extractChallenge(response.response.clientDataJSON);
}

export function extractAuthenticationChallenge(response: AuthenticationResponseJSON) {
  return extractChallenge(response.response.clientDataJSON);
}

function extractChallenge(clientDataJSON: string) {
  const json = Buffer.from(clientDataJSON, "base64url").toString("utf8");
  const data = JSON.parse(json) as { challenge?: string };
  if (!data.challenge) {
    throw new Error("Missing WebAuthn challenge.");
  }
  return data.challenge;
}
