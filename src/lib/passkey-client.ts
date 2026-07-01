"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export async function registerPasskey(setupToken: string) {
  const optionsRes = await fetch("/api/auth/register/options", {
    method: "POST",
    headers: { "X-Setup-Token": setupToken },
  });
  const options = await optionsRes.json();
  if (!optionsRes.ok) {
    throw new Error(options.error ?? "Unable to start passkey setup.");
  }

  const attestation = await startRegistration({ optionsJSON: options });
  const verifyRes = await fetch("/api/auth/register/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Setup-Token": setupToken,
    },
    body: JSON.stringify(attestation),
  });
  const result = await verifyRes.json();
  if (!verifyRes.ok) {
    throw new Error(result.error ?? "Unable to verify passkey setup.");
  }
}

export async function loginWithPasskey() {
  const optionsRes = await fetch("/api/auth/login/options", { method: "POST" });
  const options = await optionsRes.json();
  if (!optionsRes.ok) {
    throw new Error(options.error ?? "Unable to start passkey login.");
  }

  const assertion = await startAuthentication({ optionsJSON: options });
  const verifyRes = await fetch("/api/auth/login/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(assertion),
  });
  const result = await verifyRes.json();
  if (!verifyRes.ok) {
    throw new Error(result.error ?? "Unable to verify passkey login.");
  }

  return result as { ok: true; csrfToken: string };
}
