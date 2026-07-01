import { NextRequest, NextResponse } from "next/server";
import { AssetServiceError, deleteAsset, sanitizeAssetType, updateAsset } from "@/lib/assets";
import { DatabaseConfigError } from "@/lib/db";
import {
  jsonError,
  rateLimitError,
  unexpectedErrorResponse,
  validationError,
} from "@/lib/api-errors";
import { checkRateLimit, checkSharedRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sanitizeDomainInput, sanitizeIpv4Input } from "@/lib/validation";
import type { AssetPatchPayload } from "@/types/assets";
import { authErrorResponse, requireSession, verifyCsrf } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const rateLimit = checkRateLimit(request, RATE_LIMITS.assets);
  if (!rateLimit.allowed) {
    return rateLimitError(rateLimit.retryAfterSeconds);
  }

  const id = await getAssetId(context);
  if (!id) {
    return validationError("Invalid monitored asset id.");
  }

  const body = await readJsonBody(request);
  const patch: AssetPatchPayload = {};

  if ("label" in body) {
    patch.label = typeof body.label === "string" ? body.label : null;
  }

  if ("value" in body || "type" in body) {
    const type = sanitizeAssetType(body.type);
    if (!type) {
      return validationError("Asset type is required when editing a monitored target.");
    }

    const value = validateAssetValue(type, body.value);
    if (!value.ok) {
      return validationError(value.error);
    }

    patch.type = type;
    patch.value = value.value;
  }

  if (!("label" in patch) && !patch.type && !patch.value) {
    return validationError("No editable fields were provided.");
  }

  try {
    const session = await requireSession(request);
    const sharedLimit = await checkSharedRateLimit(`assets:${session.id}`, 60, 60);
    if (!sharedLimit.allowed) {
      return rateLimitError(sharedLimit.retryAfterSeconds);
    }
    await verifyCsrf(request, session);
    const asset = await updateAsset(id, patch);
    return NextResponse.json({ asset });
  } catch (err) {
    return handleAssetRouteError(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const rateLimit = checkRateLimit(request, RATE_LIMITS.assets);
  if (!rateLimit.allowed) {
    return rateLimitError(rateLimit.retryAfterSeconds);
  }

  const id = await getAssetId(context);
  if (!id) {
    return validationError("Invalid monitored asset id.");
  }

  try {
    const session = await requireSession(request);
    const sharedLimit = await checkSharedRateLimit(`assets:${session.id}`, 60, 60);
    if (!sharedLimit.allowed) {
      return rateLimitError(sharedLimit.retryAfterSeconds);
    }
    await verifyCsrf(request, session);
    await deleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleAssetRouteError(err);
  }
}

async function getAssetId(context: RouteContext) {
  const { id } = await context.params;
  return UUID.test(id) ? id : null;
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
    return jsonError("The server is missing its PostgreSQL database configuration.", 500);
  }

  return unexpectedErrorResponse(err);
}
