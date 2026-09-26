"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "18px", fontWeight: 600, color: "#0a0a0a" }}>
          页面出错了 / Something went wrong
        </h1>
        <p style={{ fontSize: "14px", color: "#525252" }}>
          发生了意外错误，请重试。An unexpected error occurred, please try again.
        </p>
        {error.digest && <p style={{ fontSize: "12px", color: "#737373" }}>{error.digest}</p>}
        <button
          onClick={reset}
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: "1px solid #d4d4d4",
            background: "#fff",
            color: "#0a0a0a",
            cursor: "pointer",
          }}
        >
          重试 / Retry
        </button>
      </body>
    </html>
  );
}
