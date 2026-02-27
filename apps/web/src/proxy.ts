import { auth } from "@/auth";

// Protect all routes except:
// - /api/auth/* - NextAuth authentication endpoints
// - /_next/* - Next.js static assets
// - /favicon.ico - Site icon
// - /login - Login page
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)"],
};

export default auth;
