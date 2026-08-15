import { NextResponse } from "next/server";

const ACCOUNTS_LOOKUP_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;
const CACHE_SKEW_MS = 60 * 1000;
const tokenCache = new Map<string, number>();

function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
  } catch {
    return null;
  }
}

function decodeTokenExpiry(token: string): number | null {
  const exp = decodeTokenPayload(token)?.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return exp * 1000;
}

function decodeTokenUid(token: string): string | null {
  const uid = decodeTokenPayload(token)?.user_id;
  return typeof uid === "string" && uid ? uid : null;
}

function evictExpiredTokens() {
  const now = Date.now();
  for (const [token, expiry] of tokenCache) {
    if (expiry <= now) tokenCache.delete(token);
  }
}

export async function verifyFirebaseIdToken(
  request: Request
): Promise<{ uid: string } | NextResponse> {
  const authorization = request.headers.get("authorization");
  const idToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!idToken) {
    return NextResponse.json({ error: "用户未登录" }, { status: 401 });
  }

  const cachedExpiry = tokenCache.get(idToken);
  if (cachedExpiry && cachedExpiry > Date.now()) {
    const uid = decodeTokenUid(idToken);
    if (uid) return { uid };
    return NextResponse.json({ error: "登录状态无效" }, { status: 401 });
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

    const payload = (await response.json()) as {
      users?: Array<{ localId?: string }>;
    };
    const uid = payload.users?.[0]?.localId ?? decodeTokenUid(idToken);
    if (!uid) {
      return NextResponse.json({ error: "登录状态无效" }, { status: 401 });
    }

    const expiry =
      decodeTokenExpiry(idToken) ?? Date.now() + DEFAULT_TOKEN_TTL_MS;
    const ttl = expiry - Date.now() - CACHE_SKEW_MS;
    if (ttl > 0) {
      if (tokenCache.size >= 1000) evictExpiredTokens();
      tokenCache.set(idToken, Date.now() + ttl);
    }

    return { uid };
  } catch {
    return NextResponse.json({ error: "身份验证失败" }, { status: 401 });
  }
}
