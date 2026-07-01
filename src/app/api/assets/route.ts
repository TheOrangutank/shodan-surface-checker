import { NextRequest, NextResponse } from "next/server";
import { AssetServiceError, createAsset, listAssets, sanitizeAssetType } from "@/lib/assets";
import { DatabaseConfigError } from "@/lib/db";
import {
  jsonError,
  rateLimitError,
  unexpectedErrorResponse,
  validationError,
} from "@/lib/api-errors";
import { checkRateLimit, checkSharedRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sanitizeDomainInput, sanitizeIpv4Input } from "@/lib/validation";
import { authErrorResponse, requireSession, verifyCsrf } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(request, RATE_LIMITS.assets);
  if (!rateLimit.allowed) {
    return rateLimitError(rateLimit.retryAfterSeconds);
  }

  try {
    const session = await requireSession(request);
    const sharedLimit = await checkSharedRateLimit(`assets:${session.id}`, 60, 60);
    if (!sharedLimit.allowed) {
      return rateLimitError(sharedLimit.retryAfterSeconds);
    }
    const assets = await listAssets();
    return NextResponse.json({ assets });
  } catch (err) {
    return handleAssetRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, RATE_LIMITS.assets);
  if (!rateLimit.allowed) {
    return rateLimitError(rateLimit.retryAfterSeconds);
  }

  const body = await readJsonBody(request);
  const type = sanitizeAssetType(body.type);

  if (!type) {
    return validationError("Asset type must be domain or ip.");
  }

  const value = validateAssetValue(type, body.value);
  if (!value.ok) {
    return validationError(value.error);
  }

  try {
    const session = await requireSession(request);
    const sharedLimit = await checkSharedRateLimit(`assets:${session.id}`, 60, 60);
    if (!sharedLimit.allowed) {
      return rateLimitError(sharedLimit.retryAfterSeconds);
    }
    await verifyCsrf(request, session);
    const asset = await createAsset({
      type,
      value: value.value,
      label: typeof body.label === "string" ? body.label : null,
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    return handleAssetRouteError(err);
  }
}

function validateAssetValue(type: "domain" | "ip", value: unknown) {
  const text = typeof value === "string" ? value : null;
  return type === "domain" ? sanitizeDomainInput(text) : sanitizeIpv4Input(text);
}

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function handleAssetRouteError(err: unknown) {
  if (err instanceof Error && err.name === "AuthError") {
    return authErrorResponse(err);
  }

  if (err instanceof AssetServiceError) {
    return jsonError(err.message, err.status);
  }

  if (err instanceof DatabaseConfigError) {
    return jsonError("The server is missing its Supabase database configuration.", 500);
  }

  return unexpectedErrorResponse(err);
}
