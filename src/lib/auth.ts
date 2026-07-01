import "server-only";
import { createHash, createHmac, randomBytes } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { AuthenticatorTransportFuture, WebAuthnCredential } from "@simplewebauthn/server";
import { getDb } from "@/lib/db";

export const SESSION_COOKIE = "asc_session";
export const CSRF_COOKIE = "asc_csrf";

const SESSION_TTL_SECONDS = 60 * 60 * 12;
const CHALLENGE_TTL_SECONDS = 60 * 5;

export interface AppSession {
  id: string;
  token_hash: string;
  csrf_hash: string;
  expires_at: string;
}

export interface StoredCredential {
  id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: AuthenticatorTransportFuture[] | null;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const PLACEHOLDER_APP_ORIGIN = "https://your-domain.example.com";
const PLACEHOLDER_RP_ID = "your-domain.example.com";
const PLACEHOLDER_SESSION_SECRET = "replace_with_long_random_secret";

function requireConfiguredOrigin(): string {
  const appOrigin = process.env.APP_ORIGIN?.trim();

  if (!appOrigin || appOrigin === PLACEHOLDER_APP_ORIGIN) {
    throw new AuthError(
      "APP_ORIGIN is not configured. Copy .env.example to .env.local and set your public URL.",
      500,
    );
  }

  try {
    const parsed = new URL(appOrigin);
    if (!parsed.protocol.startsWith("http")) {
      throw new Error("invalid protocol");
    }
    return parsed.origin;
  } catch {
    throw new AuthError(
      "APP_ORIGIN must be a valid URL with scheme (e.g. https://your-domain.example.com).",
      500,
    );
  }
}

function requireConfiguredRpId(appOrigin: string): string {
  const rpId = process.env.RP_ID?.trim();

  if (!rpId || rpId === PLACEHOLDER_RP_ID) {
    throw new AuthError(
      "RP_ID is not configured. Copy .env.example to .env.local and set your domain hostname.",
      500,
    );
  }

  const originHostname = new URL(appOrigin).hostname;
  if (rpId !== originHostname) {
    throw new AuthError(
      "RP_ID must match the hostname in APP_ORIGIN (e.g. APP_ORIGIN=https://example.com and RP_ID=example.com).",
      500,
    );
  }

  return rpId;
}

export function getAuthConfig() {
  const appOrigin = requireConfiguredOrigin();
  const rpId = requireConfiguredRpId(appOrigin);
  const sessionSecret = process.env.SESSION_SECRET;

  if (
    !sessionSecret ||
    sessionSecret.length < 32 ||
    sessionSecret === PLACEHOLDER_SESSION_SECRET
  ) {
    throw new AuthError(
      "The server is missing a strong SESSION_SECRET. Generate one with: openssl rand -base64 48",
      500,
    );
  }

  return {
    appOrigin,
    rpId,
    rpName: "Attack Surface Checker",
    sessionSecret,
  };
}

export function requireSetupToken(request: NextRequest) {
  const expected = process.env.PASSKEY_SETUP_TOKEN;
  const provided = request.headers.get("x-setup-token");

  if (!expected || expected.length < 32) {
    throw new AuthError("Passkey setup is not configured.", 500);
  }

  if (!provided || !constantTimeEqual(provided, expected)) {
    throw new AuthError("Invalid setup token.", 403);
  }
}

export async function passkeyRegistrationAllowed() {
  const { count, error } = await getDb()
    .from("passkey_credentials")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new AuthError("Unable to check passkey registration state.", 500);
  }

  return (count ?? 0) === 0 || process.env.ALLOW_PASSKEY_REENROLL === "true";
}

export async function saveChallenge(type: "registration" | "authentication", challenge: string) {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
  const { error } = await getDb()
    .from("auth_challenges")
    .insert({ type, challenge, expires_at: expiresAt });

  if (error) {
    throw new AuthError("Unable to save authentication challenge.", 500);
  }
}

export async function consumeChallenge(type: "registration" | "authentication", challenge: string) {
  const { data, error } = await getDb()
    .from("auth_challenges")
    .delete()
    .eq("type", type)
    .eq("challenge", challenge)
    .gt("expires_at", new Date().toISOString())
    .select("challenge")
    .single();

  if (error || !data) {
    throw new AuthError("Authentication challenge expired or was not found.", 400);
  }
}

export async function listCredentials() {
  const { data, error } = await getDb()
    .from("passkey_credentials")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new AuthError("Unable to load passkey credentials.", 500);
  }

  return data as StoredCredential[];
}

export async function saveCredential(credential: WebAuthnCredential) {
  const { error } = await getDb().from("passkey_credentials").insert({
    credential_id: credential.id,
    public_key: bytesToBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
  });

  if (error) {
    throw new AuthError("Unable to save passkey credential.", 500);
  }
}

export async function getCredential(credentialId: string) {
  const { data, error } = await getDb()
    .from("passkey_credentials")
    .select("*")
    .eq("credential_id", credentialId)
    .single();

  if (error || !data) {
    throw new AuthError("Passkey credential was not found.", 401);
  }

  return data as StoredCredential;
}

export async function updateCredentialCounter(credentialId: string, counter: number) {
  await getDb()
    .from("passkey_credentials")
    .update({ counter, last_used_at: new Date().toISOString() })
    .eq("credential_id", credentialId);
}

export function toWebAuthnCredential(credential: StoredCredential): WebAuthnCredential {
  return {
    id: credential.credential_id,
    publicKey: base64UrlToBytes(credential.public_key),
    counter: credential.counter,
    transports: credential.transports ?? undefined,
  };
}

export async function createSession(request: NextRequest) {
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const { sessionSecret } = getAuthConfig();

  const { data, error } = await getDb()
    .from("app_sessions")
    .insert({
      token_hash: hashSecret(sessionToken, sessionSecret),
      csrf_hash: hashSecret(csrfToken, sessionSecret),
      user_agent: request.headers.get("user-agent"),
      ip: getClientIp(request),
      expires_at: expiresAt.toISOString(),
    })
    .select("id, token_hash, csrf_hash, expires_at")
    .single();

  if (error || !data) {
    throw new AuthError("Unable to create session.", 500);
  }

  return {
    session: data as AppSession,
    sessionToken,
    csrfToken,
    expiresAt,
  };
}

export async function getSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const { sessionSecret } = getAuthConfig();
  const tokenHash = hashSecret(token, sessionSecret);
  const { data, error } = await getDb()
    .from("app_sessions")
    .select("id, token_hash, csrf_hash, expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) return null;

  await getDb()
    .from("app_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return data as AppSession;
}

export async function requireSession(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    throw new AuthError("Authentication required.", 401);
  }
  return session;
}

export async function destroySession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return;

  const { sessionSecret } = getAuthConfig();
  await getDb()
    .from("app_sessions")
    .delete()
    .eq("token_hash", hashSecret(token, sessionSecret));
}

export function setSessionCookies(
  response: NextResponse,
  sessionToken: string,
  csrfToken: string,
  expiresAt: Date,
) {
  const secure = getAuthConfig().appOrigin.startsWith("https://");
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
  response.cookies.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(CSRF_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function verifyCsrf(request: NextRequest, session: AppSession) {
  const { appOrigin, sessionSecret } = getAuthConfig();
  const origin = request.headers.get("origin");

  if (origin && origin !== appOrigin) {
    throw new AuthError("Invalid request origin.", 403);
  }

  const headerToken = request.headers.get("x-csrf-token");
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    throw new AuthError("Invalid CSRF token.", 403);
  }

  if (hashSecret(headerToken, sessionSecret) !== session.csrf_hash) {
    throw new AuthError("Invalid CSRF token.", 403);
  }
}

export function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }

  return Response.json({ error: "Authentication failed." }, { status: 500 });
}

export function getClientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function hashSecret(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function bytesToBase64Url(value: Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

export function base64UrlToBytes(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function constantTimeEqual(a: string, b: string) {
  const aHash = createHash("sha256").update(a).digest();
  const bHash = createHash("sha256").update(b).digest();
  return aHash.length === bHash.length && aHash.equals(bHash);
}
