"use client";

import { Button } from "@/components/ui";
import { useEffect } from "react";

const ErrorPage = ({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) => {
  useEffect(() => {
    console.error("Unhandled app error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold">页面出错了 / Something went wrong</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        发生了意外错误，请重试。An unexpected error occurred, please try again.
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {error.digest}
        </p>
      )}
      <Button onClick={reset}>重试 / Retry</Button>
    </main>
  );
};

export default ErrorPage;
