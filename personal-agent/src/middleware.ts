import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "personal-agent-session";

function getSecret() {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET ?? "dev-secret-change-in-production",
  );
}

async function isValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = await isValidSession(request);

  if (pathname.startsWith("/login")) {
    if (authed) {
      return NextResponse.redirect(new URL("/chat", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/" || pathname.startsWith("/chat") || pathname.startsWith("/api/chat")) {
    if (!authed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/chat/:path*", "/api/chat/:path*"],
};
