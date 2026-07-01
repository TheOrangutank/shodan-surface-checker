import { NextRequest, NextResponse } from "next/server";
import {
  authErrorResponse,
  clearSessionCookies,
  destroySession,
  requireSession,
  verifyCsrf,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    await verifyCsrf(request, session);
    await destroySession(request);

    const res = NextResponse.json({ ok: true });
    clearSessionCookies(res);
    return res;
  } catch (err) {
    return authErrorResponse(err);
  }
}
