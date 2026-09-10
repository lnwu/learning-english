import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "./serverAuth";

let tokenNonce = 0;

const makeToken = (uid: string, expSeconds: number) => {
  tokenNonce += 1;
  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" })
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ user_id: uid, exp: expSeconds, jti: tokenNonce })
  ).toString("base64url");
  return `${header}.${payload}.signature`;
};

const futureExpiry = () => Math.floor(Date.now() / 1000) + 3600;

const makeRequest = (token?: string) =>
  new Request("http://localhost/api/test", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("verifyFirebaseIdToken", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  let fetchCalls = 0;

  const mockFetch = (
    result: { ok: boolean; localId?: string } | "network"
  ) => {
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      if (result === "network") {
        throw new Error("network down");
      }
      return {
        ok: result.ok,
        json: async () => ({
          users: result.localId ? [{ localId: result.localId }] : [],
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  };

  beforeEach(() => {
    fetchCalls = 0;
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY = originalKey;
    }
  });

  it("缺少 Authorization 时返回 401", async () => {
    const result = await verifyFirebaseIdToken(makeRequest());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("缺少 API key 时返回 500", async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const result = await verifyFirebaseIdToken(
      makeRequest(makeToken("u-missing-key", futureExpiry()))
    );
    expect((result as NextResponse).status).toBe(500);
  });

  it("Identity Toolkit 拒绝时返回 401", async () => {
    mockFetch({ ok: false });
    const result = await verifyFirebaseIdToken(
      makeRequest(makeToken("u-rejected", futureExpiry()))
    );
    expect((result as NextResponse).status).toBe(401);
  });

  it("网络错误时返回 401", async () => {
    mockFetch("network");
    const result = await verifyFirebaseIdToken(
      makeRequest(makeToken("u-network", futureExpiry()))
    );
    expect((result as NextResponse).status).toBe(401);
  });

  it("校验通过返回 uid", async () => {
    mockFetch({ ok: true, localId: "user-1" });
    const result = await verifyFirebaseIdToken(
      makeRequest(makeToken("user-1", futureExpiry()))
    );
    expect(result).toEqual({ uid: "user-1" });
    expect(fetchCalls).toBe(1);
  });

  it("有效 token 命中缓存后不再请求", async () => {
    const token = makeToken("user-cache", futureExpiry());
    mockFetch({ ok: true, localId: "user-cache" });
    await verifyFirebaseIdToken(makeRequest(token));
    await verifyFirebaseIdToken(makeRequest(token));
    expect(fetchCalls).toBe(1);
  });

  it("缓存超过上限时淘汰最旧条目", async () => {
    mockFetch({ ok: true, localId: "user-cap" });
    const first = makeToken("user-cap", futureExpiry());
    await verifyFirebaseIdToken(makeRequest(first));
    expect(fetchCalls).toBe(1);

    for (let i = 0; i < 1001; i++) {
      await verifyFirebaseIdToken(
        makeRequest(makeToken("user-cap", futureExpiry()))
      );
    }

    await verifyFirebaseIdToken(makeRequest(first));
    expect(fetchCalls).toBe(1003);
  });
});
