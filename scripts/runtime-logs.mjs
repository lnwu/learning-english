#!/usr/bin/env bun
import { spawnSync } from "node:child_process";

const RETENTION_MS = 60 * 60 * 1000;
const EVENT_FIELDS = [
  "route",
  "policy",
  "status",
  "apiStatus",
  "origin",
  "durationMs",
  "totalMs",
  "attempt",
  "maxAttempts",
  "attempts",
  "outcome",
  "provider",
  "model",
  "source",
  "willRetry",
  "timeoutMs",
  "finishReason",
  "hit",
  "layer",
  "degraded",
  "reason",
  "candidateCount",
  "chunkSize",
  "goneCount",
  "retriedCount",
  "discardedCount",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "requestId",
  "uid",
  "errorName",
  "errorMessage",
  "errorCode",
  "errorStatus",
  "errorStatusCode",
  "errorCause",
  "errorResponse",
  "errorUrl",
  "errorDigest",
];

const args = process.argv.slice(2);

const takeFlag = (name) => {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) return "";
  args.splice(index, 2);
  return value;
};

const hasFlag = (name) => {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
};

const environment = takeFlag("environment");
const branch = takeFlag("branch");
const since = takeFlag("since") ?? "1h";
const until = takeFlag("until");
const level = takeFlag("level");
const events = (takeFlag("event") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const query = takeFlag("query");
const requestId = takeFlag("request-id");
const statusCode = takeFlag("status");
const deployment = takeFlag("deployment");
const project = takeFlag("project");
const limit = takeFlag("limit") ?? "100";
const onlyRequests = hasFlag("requests");
const rawJson = hasFlag("json");

const parseWindowMs = (value) => {
  const match = /^(\d+)(m|h|d)$/.exec(value);
  if (!match) return null;
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return Number(match[1]) * unit;
};

const windowMs = parseWindowMs(since);
const windowStart = windowMs === null ? new Date(since).getTime() : Date.now() - windowMs;
if (Number.isFinite(windowStart) && Date.now() - windowStart > RETENTION_MS) {
  process.stderr.write(
    `[logs] 当前窗口超过 Vercel Hobby 的 1 小时保留上限，更早的日志不会被返回。\n`,
  );
}

const cliArgs = ["x", "vercel", "logs", "--json", "--limit", limit, "--since", since];
if (environment) cliArgs.push("--environment", environment);
if (branch) cliArgs.push("--branch", branch);
if (until) cliArgs.push("--until", until);
if (level) cliArgs.push("--level", level);
if (query) cliArgs.push("--query", query);
if (statusCode) cliArgs.push("--status-code", statusCode);
if (deployment) cliArgs.push("--deployment", deployment);
if (project) cliArgs.push("--project", project);

const result = spawnSync("bun", cliArgs, {
  cwd: new URL("../apps/web", import.meta.url),
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});
if (result.error) {
  process.stderr.write(`[logs] 无法执行 vercel logs：${result.error.message}\n`);
  process.exit(2);
}
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? "");
  process.stderr.write(`[logs] vercel logs 退出码 ${result.status}\n`);
  process.exit(2);
}

const parseEntry = (raw) => {
  const candidates =
    typeof raw === "string"
      ? [raw]
      : raw && typeof raw === "object"
        ? [typeof raw.message === "string" ? raw.message : "", JSON.stringify(raw)]
        : [];

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && typeof parsed.event === "string") return parsed;
    } catch {
      continue;
    }
  }
  return null;
};

const formatValue = (value) => {
  const text = String(value);
  return /[\s"]/.test(text) ? JSON.stringify(text) : text;
};

const formatEvent = (entry) => {
  const parts = [entry.time ?? "", entry.level ?? "info", entry.event ?? "log"];
  if (entry.message) parts.push(formatValue(entry.message));
  for (const key of EVENT_FIELDS) {
    if (entry[key] === undefined || entry[key] === null || entry[key] === "") continue;
    parts.push(`${key}=${formatValue(entry[key])}`);
  }
  return parts.join(" ");
};

const formatRequest = (record) => {
  const time = record.timestamp ? new Date(record.timestamp).toISOString() : "";
  return [
    time,
    record.level ?? "info",
    "request",
    record.requestMethod ?? "",
    record.requestPath ?? "",
    `status=${record.responseStatusCode ?? ""}`,
    record.cache ? `cache=${record.cache}` : "",
  ]
    .filter(Boolean)
    .join(" ");
};

const output = [];
let errorCount = 0;
let eventCount = 0;

for (const line of (result.stdout ?? "").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) continue;

  let record;
  try {
    record = JSON.parse(trimmed);
  } catch {
    continue;
  }

  const entries = (record.logs ?? []).map((raw) => parseEntry(raw)).filter(Boolean);
  const matched = entries.filter(
    (entry) =>
      (!requestId || entry.requestId === requestId) &&
      (events.length === 0 || events.includes(entry.event)),
  );

  for (const entry of matched) {
    eventCount += 1;
    if (entry.level === "error" || entry.level === "fatal") errorCount += 1;
    output.push(rawJson ? JSON.stringify(entry) : formatEvent(entry));
  }

  const status = Number(record.responseStatusCode);
  const isRequestError = Number.isFinite(status) && status >= 400;
  const showRequest = onlyRequests || (isRequestError && matched.length === 0);
  if (showRequest && !requestId) {
    if (isRequestError && status >= 500) errorCount += 1;
    output.push(
      rawJson ? JSON.stringify({ event: "vercel.request", ...record }) : formatRequest(record),
    );
  }
}

process.stdout.write(`${output.join("\n")}${output.length > 0 ? "\n" : ""}`);
process.stderr.write(
  `[logs] 事件 ${eventCount} 条，其中 error ${errorCount} 条（窗口 ${since}${
    environment ? `，环境 ${environment}` : ""
  }）\n`,
);

process.exit(errorCount > 0 ? 1 : 0);
