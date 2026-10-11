import type { Instrumentation } from "next";
import { createLogger, newRequestId } from "@/lib/log";

const log = createLogger({ mod: "instrumentation" });

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  log.error(
    "server.error",
    "Unhandled request error",
    {
      requestId: newRequestId(),
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
    },
    error,
  );
};
