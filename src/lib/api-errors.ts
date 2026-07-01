import { NextResponse } from "next/server";
import { ShodanError } from "@/lib/shodan";

const PUBLIC_SHODAN_ERRORS: Record<number, string> = {
  401: "Shodan rejected the configured API key or account permissions.",
  403: "Shodan rejected the configured API key or account permissions.",
  404: "Shodan did not find data for that target.",
  429: "Shodan rate limit reached. Try again later.",
};

export function jsonError(
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return NextResponse.json({ error: message }, { status, headers });
}

export function validationError(message: string) {
  return jsonError(message, 400);
}

export function rateLimitError(retryAfterSeconds: number) {
  return jsonError("Too many requests. Try again soon.", 429, {
    "Retry-After": String(retryAfterSeconds),
  });
}

export function shodanErrorResponse(err: ShodanError) {
  logServerError(err);

  if (err.code === "missing_api_key") {
    return jsonError("The server is missing its Shodan API key.", 500);
  }

  const message =
    PUBLIC_SHODAN_ERRORS[err.status] ?? "Unable to complete the Shodan lookup right now.";

  return jsonError(message, normalizeStatus(err.status));
}

export function getPublicShodanErrorMessage(err: ShodanError) {
  if (err.code === "missing_api_key") {
    return "The server is missing its Shodan API key.";
  }

  return (
    PUBLIC_SHODAN_ERRORS[err.status] ?? "Unable to complete the Shodan lookup right now."
  );
}

export function unexpectedErrorResponse(err: unknown) {
  logServerError(err);
  return jsonError("Unexpected server error", 500);
}

function normalizeStatus(status: number) {
  return status >= 400 && status <= 599 ? status : 502;
}

function logServerError(err: unknown) {
  if (err instanceof ShodanError) {
    console.error("Shodan request failed", {
      status: err.status,
      code: err.code,
      message: redactSecrets(err.message),
    });
    return;
  }

  if (err instanceof Error) {
    console.error("Unexpected server error", {
      name: err.name,
      message: redactSecrets(err.message),
      stack: err.stack ? redactSecrets(err.stack) : undefined,
    });
    return;
  }

  console.error("Unexpected non-error thrown", err);
}

function redactSecrets(value: string) {
  return value.replace(/key=([^&\s]+)/gi, "key=[REDACTED]");
}
