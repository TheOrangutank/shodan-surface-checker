import { NextRequest, NextResponse } from "next/server";
import { AssetServiceError, refreshAsset } from "@/lib/assets";
import { DatabaseConfigError } from "@/lib/db";
import {
  jsonError,
  rateLimitError,
  unexpectedErrorResponse,
  validationError,
} from "@/lib/api-errors";
import { checkRateLimit, checkSharedRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { authErrorResponse, requireSession, verifyCsrf } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: RouteContext) {
  const rateLimit = checkRateLimit(request, RATE_LIMITS.assetRefresh);
  if (!rateLimit.allowed) {
    return rateLimitError(rateLimit.retryAfterSeconds);
  }

  const { id } = await context.params;
  if (!UUID.test(id)) {
    return validationError("Invalid monitored asset id.");
  }

  try {
    const session = await requireSession(request);
    const sharedLimit = await checkSharedRateLimit(`asset-refresh:${session.id}`, 5, 60);
    if (!sharedLimit.allowed) {
      return rateLimitError(sharedLimit.retryAfterSeconds);
    }
    await verifyCsrf(request, session);
    const asset = await refreshAsset(id);
    return NextResponse.json({ asset });
  } catch (err) {
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
}
