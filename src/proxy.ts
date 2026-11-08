import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "cverixa_session";
const PUBLIC_PATHS = ["/login", "/api/health"];

/**
 * Edge-level route protection: requests without a session cookie are sent to
 * the login page. Every server action and page still re-validates the session
 * against the database (defence in depth).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!isPublic && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|robots.txt).*)"],
};
