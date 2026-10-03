import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/serverAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { AiServiceError } from "@/lib/aiClient";

export interface ApiPolicy {
  name: string;
  limit: number;
  fallbackError: string;
}

export type ApiParseResult<T> = { ok: true; body: T } | { ok: false; response: NextResponse };

export const API_RATE_LIMITS = {
  translate: { name: "translate", limit: 30 },
  translateCompare: { name: "translate/compare", limit: 10 },
  regenerateDefinitions: { name: "regenerate", limit: 60 },
  sentenceGenerate: { name: "sentence/generate", limit: 10 },
  sentenceCheck: { name: "sentence/check", limit: 20 },
} as const;

const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export const mapApiError = (
  error: unknown,
  fallbackError: string,
): { status: number; error: string } =>
  error instanceof AiServiceError
    ? { status: error.status, error: error.message }
    : { status: 500, error: fallbackError };

export const withApiPost = async <T>(
  request: Request,
  policy: ApiPolicy,
  parse: (raw: unknown) => ApiParseResult<T>,
  handle: (body: T, context: { uid: string }) => Promise<NextResponse>,
): Promise<NextResponse> => {
  const auth = await verifyFirebaseIdToken(request);
  if (auth instanceof NextResponse) return auth;

  const rateLimitError = await checkRateLimit(
    `${auth.uid}:${policy.name}`,
    policy.limit,
    RATE_LIMIT_WINDOW_MS,
  );
  if (rateLimitError) return rateLimitError;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const parsed = parse(raw);
  if (!parsed.ok) return parsed.response;

  try {
    return await handle(parsed.body, { uid: auth.uid });
  } catch (error) {
    console.error(`${policy.name} failed:`, error);
    const mapped = mapApiError(error, policy.fallbackError);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
};
