import { NextResponse } from "next/server";

const ACCOUNTS_LOOKUP_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;
const CACHE_SKEW_MS = 60 * 1000;
const tokenCache = new Map<string, number>();

function decodeTokenExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    const exp = payload.exp;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    return exp * 1000;
  } catch {
    return null;
  }
}

function evictExpiredTokens() {
  const now = Date.now();
  for (const [token, expiry] of tokenCache) {
    if (expiry <= now) tokenCache.delete(token);
  }
}

export async function verifyFirebaseIdToken(
  request: Request
): Promise<NextResponse | null> {
  const authorization = request.headers.get("authorization");
  const idToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!idToken) {
    return NextResponse.json({ error: "用户未登录" }, { status: 401 });
  }

  const cachedExpiry = tokenCache.get(idToken);
  if (cachedExpiry && cachedExpiry > Date.now()) {
    return null;
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "服务配置错误" }, { status: 500 });
  }

  try {
    const response = await fetch(`${ACCOUNTS_LOOKUP_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "登录状态无效" }, { status: 401 });
    }

    const expiry =
      decodeTokenExpiry(idToken) ?? Date.now() + DEFAULT_TOKEN_TTL_MS;
    const ttl = expiry - Date.now() - CACHE_SKEW_MS;
    if (ttl > 0) {
      if (tokenCache.size >= 1000) evictExpiredTokens();
      tokenCache.set(idToken, Date.now() + ttl);
    }

    return null;
  } catch {
    return NextResponse.json({ error: "身份验证失败" }, { status: 401 });
  }
}
