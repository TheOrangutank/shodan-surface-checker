import { NextRequest, NextResponse } from "next/server";
import { CSRF_COOKIE, authErrorResponse, getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ authenticated: false });
    }

    return NextResponse.json({
      authenticated: true,
      csrfToken: request.cookies.get(CSRF_COOKIE)?.value ?? null,
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
