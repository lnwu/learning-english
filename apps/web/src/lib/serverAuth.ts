import { NextResponse } from "next/server";

const ACCOUNTS_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;
const CACHE_SKEW_MS = 60 * 1000;
const MAX_TOKEN_CACHE_ENTRIES = 1000;
const tokenCache = new Map<string, number>();

const unauthorized = (message: string): NextResponse =>
  NextResponse.json({ error: message }, { status: 401 });

const decodeTokenClaims = (token: string): { uid: string; expiry: number | null } | null => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      user_id?: unknown;
      exp?: unknown;
    };
    const uid = typeof payload.user_id === "string" && payload.user_id ? payload.user_id : null;
    if (!uid) return null;
    const expiry =
      typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
    return { uid, expiry };
  } catch {
    return null;
  }
};

function evictExpiredTokens() {
  const now = Date.now();
  for (const [token, expiry] of tokenCache) {
    if (expiry <= now) tokenCache.delete(token);
  }
}

export async function verifyFirebaseIdToken(
  request: Request,
): Promise<{ uid: string } | NextResponse> {
  const authorization = request.headers.get("authorization");
  const idToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!idToken) {
    return unauthorized("用户未登录");
  }

  const claims = decodeTokenClaims(idToken);
  const cachedExpiry = tokenCache.get(idToken);
  if (cachedExpiry && cachedExpiry > Date.now()) {
    return claims ? { uid: claims.uid } : unauthorized("登录状态无效");
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
      return unauthorized("登录状态无效");
    }

    const payload = (await response.json()) as {
      users?: Array<{ localId?: string }>;
    };
    const uid = payload.users?.[0]?.localId ?? claims?.uid;
    if (!uid) {
      return unauthorized("登录状态无效");
    }

    const expiry = claims?.expiry ?? Date.now() + DEFAULT_TOKEN_TTL_MS;
    const ttl = expiry - Date.now() - CACHE_SKEW_MS;
    if (ttl > 0) {
      if (tokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
        evictExpiredTokens();
      }
      while (tokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
        const oldest = tokenCache.keys().next().value;
        if (oldest === undefined) break;
        tokenCache.delete(oldest);
      }
      tokenCache.set(idToken, Date.now() + ttl);
    }

    return { uid };
  } catch {
    return unauthorized("身份验证失败");
  }
}
