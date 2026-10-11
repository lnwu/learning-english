import { describe, it, expect, spyOn } from "bun:test";
import { createLogger, errorFields } from "./log";

const captureConsole = () => {
  const lines: string[] = [];
  const push = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  const log = spyOn(console, "log").mockImplementation(push);
  const warn = spyOn(console, "warn").mockImplementation(push);
  const error = spyOn(console, "error").mockImplementation(push);

  return {
    lines,
    restore: () => {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    },
  };
};

describe("errorFields", () => {
  it("展开错误名、消息、代码与状态码", () => {
    const error = Object.assign(new Error("boom"), { code: "permission-denied", status: 403 });

    expect(errorFields(error)).toMatchObject({
      errorName: "Error",
      errorMessage: "boom",
      errorCode: "permission-denied",
      errorStatus: 403,
    });
  });

  it("展开 cause 链并截断超长消息", () => {
    const cause = new Error("underlying");
    const error = new Error("outer", { cause });
    const fields = errorFields(error);

    expect(fields.errorMessage).toBe("outer");
    expect(fields.errorCause).toBe("Error: underlying");
  });

  it("接受非 Error 对象与非对象值", () => {
    expect(errorFields({ code: "failed-precondition" })).toMatchObject({
      errorName: "UnknownError",
      errorCode: "failed-precondition",
    });
    expect(errorFields("plain")).toMatchObject({ errorName: "Value", errorMessage: "plain" });
    expect(errorFields(null)).toEqual({});
  });
});

describe("createLogger", () => {
  it("输出单行 JSON 并带基线字段", () => {
    const console = captureConsole();
    try {
      createLogger({ mod: "test" }).info("api.request", "done", { route: "/api/translate" });
    } finally {
      console.restore();
    }

    expect(console.lines).toHaveLength(1);
    expect(console.lines[0]).not.toContain("\n");
    expect(Object.keys(JSON.parse(console.lines[0] ?? ""))[0]).toBe("level");
    expect(JSON.parse(console.lines[0] ?? "")).toMatchObject({
      level: "info",
      event: "api.request",
      message: "done",
      mod: "test",
      route: "/api/translate",
    });
  });

  it("脱敏敏感键并丢弃非原始值", () => {
    const console = captureConsole();
    try {
      createLogger().warn("api.call.failed", "careful", {
        prompt: "secret prompt",
        idToken: "secret token",
        nested: undefined as unknown as string,
        translation: "中文",
        status: 429,
      });
    } finally {
      console.restore();
    }

    const payload = JSON.parse(console.lines[0] ?? "");
    expect(payload.prompt).toBe("[redacted]");
    expect(payload.idToken).toBe("[redacted]");
    expect(payload.translation).toBe("[redacted]");
    expect(payload.status).toBe(429);
    expect(payload).not.toHaveProperty("nested");
  });

  it("截断超长字符串", () => {
    const console = captureConsole();
    try {
      createLogger().info("api.request", "done", { note: "x".repeat(800) });
    } finally {
      console.restore();
    }

    const payload = JSON.parse(console.lines[0] ?? "");
    expect(payload.note.length).toBe(500);
    expect(payload.note.endsWith("…")).toBe(true);
  });

  it("debug 在非开发环境丢弃", () => {
    const console = captureConsole();
    try {
      createLogger().debug("api.request", "noise");
    } finally {
      console.restore();
    }

    expect(console.lines).toHaveLength(0);
  });

  it("error 走 console.error 并带错误字段", () => {
    const console = captureConsole();
    try {
      createLogger().error(
        "sync.batch.failed",
        "Failed to sync batch",
        { retryCount: 1 },
        new Error("offline"),
      );
    } finally {
      console.restore();
    }

    expect(JSON.parse(console.lines[0] ?? "")).toMatchObject({
      level: "error",
      event: "sync.batch.failed",
      retryCount: 1,
      errorMessage: "offline",
    });
  });

  it("调用方字段不能覆盖保留字段", () => {
    const console = captureConsole();
    try {
      createLogger({ mod: "api" }).warn("api.call.failed", "careful", {
        event: "api.request",
        level: "info",
        message: "forged",
        time: "forged",
        mod: "forged",
      });
    } finally {
      console.restore();
    }

    expect(JSON.parse(console.lines[0] ?? "")).toMatchObject({
      level: "warn",
      event: "api.call.failed",
      message: "careful",
      mod: "api",
    });
  });

  it("child 合并绑定字段", () => {
    const console = captureConsole();
    try {
      createLogger({ mod: "words" }).child({ uid: "u1" }).info("cache.lookup", "hit");
    } finally {
      console.restore();
    }

    expect(JSON.parse(console.lines[0] ?? "")).toMatchObject({ mod: "words", uid: "u1" });
  });
});
