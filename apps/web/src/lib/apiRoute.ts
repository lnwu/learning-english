import { NextResponse } from "next/server";
import { apiErrorResponse, type ApiErrorCode } from "@/lib/apiErrors";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { AiServiceError } from "@/lib/aiClient";
import { createLogger, newRequestId, nowMs, type LogFields } from "@/lib/log";

const log = createLogger({ mod: "api" });

export interface ApiPolicy {
  name: string;
  limit: number;
  fallbackCode: ApiErrorCode;
}

export type ApiParseResult<T> = { ok: true; body: T } | { ok: false; response: NextResponse };

export const API_RATE_LIMITS = {
  translate: { name: "translate", limit: 30 },
  translateRefresh: { name: "translate/refresh", limit: 60 },
  translateCompare: { name: "translate/compare", limit: 10 },
  sentenceGenerate: { name: "sentence/generate", limit: 10 },
  sentenceCheck: { name: "sentence/check", limit: 20 },
  logs: { name: "logs", limit: 30 },
} as const;

const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export const mapApiError = (
  error: unknown,
  fallbackCode: ApiErrorCode,
): { status: number; code: ApiErrorCode } =>
  error instanceof AiServiceError
    ? { status: error.status, code: error.code }
    : { status: 500, code: fallbackCode };

export const handleApiPost = async <T>(
  request: Request,
  policy: ApiPolicy | ((body: T) => ApiPolicy),
  parse: (raw: unknown) => ApiParseResult<T>,
  handle: (body: T, context: { uid: string; requestId: string }) => Promise<NextResponse>,
): Promise<NextResponse> => {
  const startedAt = nowMs();
  const requestId = newRequestId();
  const route = new URL(request.url).pathname;
  let uid: string | null = null;
  let policyName = "";
  let status = 0;
  let failure: unknown;

  const respond = (response: NextResponse): NextResponse => {
    status = response.status;
    response.headers.set("x-request-id", requestId);
    return response;
  };

  try {
    const auth = await verifyFirebaseIdToken(request);
    if (auth instanceof NextResponse) return respond(auth);
    uid = auth.uid;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return respond(apiErrorResponse("invalidJson", 400, { requestId }));
    }

    const parsed = parse(raw);
    if (!parsed.ok) return respond(parsed.response);

    const resolvedPolicy = typeof policy === "function" ? policy(parsed.body) : policy;
    policyName = resolvedPolicy.name;

    const rateLimitError = await checkRateLimit(
      `${auth.uid}:${resolvedPolicy.name}`,
      resolvedPolicy.limit,
      RATE_LIMIT_WINDOW_MS,
    );
    if (rateLimitError) {
      log.warn("api.rate_limited", "Request rejected by rate limit", {
        route,
        policy: resolvedPolicy.name,
        ...(uid ? { uid } : {}),
        limit: resolvedPolicy.limit,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });
      return respond(rateLimitError);
    }

    try {
      return respond(await handle(parsed.body, { uid: auth.uid, requestId }));
    } catch (error) {
      failure = error;
      const mapped = mapApiError(error, resolvedPolicy.fallbackCode);
      return respond(apiErrorResponse(mapped.code, mapped.status, { requestId }));
    }
  } finally {
    const fields: LogFields = {
      route,
      requestId,
      status,
      durationMs: Math.round(nowMs() - startedAt),
      ...(policyName ? { policy: policyName } : {}),
      ...(uid ? { uid } : {}),
    };

    if (failure !== undefined || status === 0 || status >= 500) {
      log.error("api.request", "Request failed", fields, failure);
    } else if (status >= 400) {
      log.warn("api.request", "Request rejected", fields);
    } else {
      log.info("api.request", "Request completed", fields);
    }
  }
};
