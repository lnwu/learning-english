import { NextResponse } from "next/server";

const ACCOUNTS_LOOKUP_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

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

    return null;
  } catch {
    return NextResponse.json({ error: "身份验证失败" }, { status: 401 });
  }
}
