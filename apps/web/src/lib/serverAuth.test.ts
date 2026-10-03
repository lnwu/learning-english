import { describe, it, expect } from "bun:test";
import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "./serverAuth";
import { makeToken, mockIdentityToolkitFetch, useEnvVar, useRestoredFetch } from "./testSupport";

const makeRequest = (token?: string) =>
  new Request("http://localhost/api/test", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("verifyFirebaseIdToken", () => {
  useEnvVar("NEXT_PUBLIC_FIREBASE_API_KEY", "test-key");
  useRestoredFetch();

  it("缺少 Authorization 时返回 401", async () => {
    const result = await verifyFirebaseIdToken(makeRequest());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("缺少 API key 时返回 500", async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const result = await verifyFirebaseIdToken(makeRequest(makeToken("u-missing-key")));
    expect((result as NextResponse).status).toBe(500);
  });

  it("Identity Toolkit 拒绝时返回 401", async () => {
    mockIdentityToolkitFetch({ ok: false });
    const result = await verifyFirebaseIdToken(makeRequest(makeToken("u-rejected")));
    expect((result as NextResponse).status).toBe(401);
  });

  it("网络错误时返回 401", async () => {
    mockIdentityToolkitFetch({ network: true });
    const result = await verifyFirebaseIdToken(makeRequest(makeToken("u-network")));
    expect((result as NextResponse).status).toBe(401);
  });

  it("校验通过返回 uid", async () => {
    const toolkit = mockIdentityToolkitFetch({ ok: true, localId: "user-1" });
    const result = await verifyFirebaseIdToken(makeRequest(makeToken("user-1")));
    expect(result).toEqual({ uid: "user-1" });
    expect(toolkit.calls).toBe(1);
  });

  it("有效 token 命中缓存后不再请求", async () => {
    const token = makeToken("user-cache");
    const toolkit = mockIdentityToolkitFetch({ ok: true, localId: "user-cache" });
    await verifyFirebaseIdToken(makeRequest(token));
    await verifyFirebaseIdToken(makeRequest(token));
    expect(toolkit.calls).toBe(1);
  });

  it("缓存超过上限时淘汰最旧条目", async () => {
    const toolkit = mockIdentityToolkitFetch({ ok: true, localId: "user-cap" });
    const first = makeToken("user-cap");
    await verifyFirebaseIdToken(makeRequest(first));
    expect(toolkit.calls).toBe(1);

    for (let i = 0; i < 1001; i++) {
      await verifyFirebaseIdToken(makeRequest(makeToken("user-cap")));
    }

    await verifyFirebaseIdToken(makeRequest(first));
    expect(toolkit.calls).toBe(1003);
  });
});
