export const LOG_EVENTS = [
  "api.request",
  "api.rate_limited",
  "rate_limit.degraded",
  "server.error",
  "app.error",
  "api.call.failed",
  "word.write.failed",
  "preference.failed",
  "firestore.error",
  "auth.error",
  "sync.batch.failed",
  "sync.discarded",
  "queue.storage.failed",
  "practice.time.failed",
  "ai.call",
  "ai.call.summary",
  "source.search",
  "auth.token.verify",
  "cache.lookup",
] as const;

export type LogEvent = (typeof LOG_EVENTS)[number];
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogValue = string | number | boolean;
export type LogFields = Record<string, LogValue>;

const CLIENT_LOG_EVENTS = [
  "app.error",
  "firestore.error",
  "auth.error",
  "sync.batch.failed",
  "sync.discarded",
  "queue.storage.failed",
  "practice.time.failed",
  "api.call.failed",
  "word.write.failed",
  "preference.failed",
] as const satisfies readonly LogEvent[];

export const isClientLogEvent = (value: string): value is LogEvent =>
  (CLIENT_LOG_EVENTS as readonly string[]).includes(value);

const MAX_VALUE_LENGTH = 500;
const MAX_STACK_LENGTH = 2000;
const MAX_FIELDS = 25;
const MAX_CAUSE_DEPTH = 3;
const MAX_BATCH_ENTRIES = 20;
const MAX_SINK_MESSAGE_LENGTH = 200;
const FLUSH_DELAY_MS = 2000;
const REDACTED = "[redacted]";
const RESERVED_FIELDS = ["level", "time", "message", "event", "env", "region", "commit"];

const REDACTED_KEY_PATTERN =
  /^(authorization|api_?key|id_?token|token|password|email|prompt|prompts|messages|body|payload|translation|english|senses|sources|excerpt|excerpts|sentence|sentences|word|words|stack)$/i;

const APP_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "local";
const VERCEL_REGION = process.env.VERCEL_REGION ?? "local";
const VERCEL_COMMIT = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);
const DEBUG_ENABLED = process.env.NODE_ENV === "development";
const STACK_ENABLED = DEBUG_ENABLED || APP_ENV === "preview";

const BASE_FIELDS: LogFields = {
  env: APP_ENV,
  region: VERCEL_REGION,
  commit: VERCEL_COMMIT,
};

export const nowMs = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();

export const newRequestId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const clip = (value: string, maxLength = MAX_VALUE_LENGTH): string =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

const property = (source: unknown, key: string): unknown =>
  typeof source === "object" && source !== null
    ? (source as Record<string, unknown>)[key]
    : undefined;

const asLogValue = (value: unknown): LogValue | undefined =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : undefined;

const describeError = (error: unknown): string => {
  const name = asLogValue(property(error, "name"));
  const message = asLogValue(property(error, "message"));
  return [name, message]
    .filter((part): part is string => typeof part === "string" && !!part)
    .join(": ");
};

export const errorFields = (error: unknown): LogFields => {
  const fields: LogFields = {};
  if (error === undefined || error === null) return fields;

  if (typeof error !== "object") {
    fields.errorName = "Value";
    fields.errorMessage = clip(String(error));
    return fields;
  }

  const name = asLogValue(property(error, "name")) ?? "UnknownError";
  const message = asLogValue(property(error, "message"));
  fields.errorName = name;
  if (typeof message === "string" && message) fields.errorMessage = clip(message);

  const code = property(error, "code");
  if (typeof code === "string" || typeof code === "number") fields.errorCode = code;

  const status = property(error, "status");
  if (typeof status === "number") fields.errorStatus = status;

  const statusCode = property(error, "statusCode");
  if (typeof statusCode === "number" && statusCode !== status) fields.errorStatusCode = statusCode;

  const responseBody = property(error, "responseBody");
  if (typeof responseBody === "string" && responseBody) fields.errorResponse = clip(responseBody);

  const url = property(error, "url");
  if (typeof url === "string" && url) fields.errorUrl = clip(url, 200);

  const digest = property(error, "digest");
  if (typeof digest === "string" && digest) fields.errorDigest = digest;

  const requestId = property(error, "requestId");
  if (typeof requestId === "string" && requestId) fields.requestId = clip(requestId, 64);

  const causes: string[] = [];
  let cause: unknown = property(error, "cause");
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && cause !== undefined && cause !== null; depth++) {
    const described = describeError(cause);
    if (described) causes.push(described);
    cause = property(cause, "cause");
  }
  if (causes.length > 0) fields.errorCause = clip(causes.join(" <- "));

  const stack = property(error, "stack");
  if (STACK_ENABLED && typeof stack === "string" && stack) {
    fields.errorStack = clip(stack, MAX_STACK_LENGTH);
  }

  return fields;
};

const sanitizeFields = (fields: LogFields | undefined, reserved: Set<string>): LogFields => {
  const result: LogFields = {};
  if (!fields) return result;

  let count = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (count >= MAX_FIELDS) break;
    if (reserved.has(key)) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      continue;
    }
    count += 1;
    result[key] = REDACTED_KEY_PATTERN.test(key)
      ? REDACTED
      : typeof value === "string"
        ? clip(value)
        : value;
  }

  return result;
};

interface PendingEntry {
  level: "warn" | "error";
  event: LogEvent;
  message: string;
  fields: LogFields;
}

const pending: PendingEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushListenerBound = false;

const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";

const flush = async (): Promise<void> => {
  flushTimer = null;
  if (pending.length === 0) return;
  const entries = pending.splice(0, MAX_BATCH_ENTRIES);
  if (pending.length > 0) scheduleFlush();

  try {
    const { getAuthInstance } = await import("@/lib/firebase");
    const idToken = await getAuthInstance().currentUser?.getIdToken();
    if (!idToken) return;
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ entries }),
      keepalive: true,
    });
  } catch {
    return;
  }
};

const scheduleFlush = (): void => {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flush, FLUSH_DELAY_MS);

  if (!flushListenerBound) {
    flushListenerBound = true;
    window.addEventListener("pagehide", flush);
  }
};

const queue = (entry: PendingEntry): void => {
  if (!isBrowser) return;
  if (pending.length >= MAX_BATCH_ENTRIES * 2) return;
  pending.push(entry);
  scheduleFlush();
};

const write = (level: LogLevel, line: string): void => {
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};

export interface Logger {
  debug: (event: LogEvent, message: string, fields?: LogFields, error?: unknown) => void;
  info: (event: LogEvent, message: string, fields?: LogFields, error?: unknown) => void;
  warn: (event: LogEvent, message: string, fields?: LogFields, error?: unknown) => void;
  error: (event: LogEvent, message: string, fields?: LogFields, error?: unknown) => void;
  child: (bindings: LogFields) => Logger;
}

export const createLogger = (bindings: LogFields = {}): Logger => {
  const emit = (
    level: LogLevel,
    event: LogEvent,
    message: string,
    fields?: LogFields,
    error?: unknown,
  ): void => {
    if (level === "debug" && !DEBUG_ENABLED) return;

    const reserved = new Set([...RESERVED_FIELDS, ...Object.keys(bindings)]);
    const sanitized = sanitizeFields(fields, reserved);
    const payload: LogFields = {
      level,
      time: new Date().toISOString(),
      message: clip(message),
      event,
      ...BASE_FIELDS,
      ...bindings,
      ...sanitized,
      ...errorFields(error),
    };
    write(level, JSON.stringify(payload));

    if ((level === "warn" || level === "error") && isClientLogEvent(event)) {
      queue({
        level,
        event,
        message: clip(message, MAX_SINK_MESSAGE_LENGTH),
        fields: { ...errorFields(error), ...sanitized },
      });
    }
  };

  return {
    debug: (event, message, fields, error) => emit("debug", event, message, fields, error),
    info: (event, message, fields, error) => emit("info", event, message, fields, error),
    warn: (event, message, fields, error) => emit("warn", event, message, fields, error),
    error: (event, message, fields, error) => emit("error", event, message, fields, error),
    child: (extra) => createLogger({ ...bindings, ...extra }),
  };
};
