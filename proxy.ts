import { type NextRequest, NextResponse } from "next/server";
import { GUEST_COOKIE } from "@/lib/guest";

// No accounts: every browser gets a random guest id on first visit, and all
// chats are scoped to it.
export function proxy(request: NextRequest) {
  if (request.cookies.has(GUEST_COOKIE)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set({
    name: GUEST_COOKIE,
    value: crypto.randomUUID(),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
