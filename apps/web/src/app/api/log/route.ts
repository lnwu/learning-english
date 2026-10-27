import { NextResponse } from "next/server";
import { API_RATE_LIMITS, handleApiPost } from "@/lib/apiRoute";
import { clientLogEntries, parseBody, type ClientLogEntryInput } from "@/lib/apiInput";
import { createLogger } from "@/lib/log";

const log = createLogger({ mod: "client" });

const parse = parseBody<{ entries: ClientLogEntryInput[] }>({
  entries: clientLogEntries({
    maxItems: 20,
    maxMessageLength: 200,
    maxFieldCount: 15,
    maxValueLength: 200,
  }),
});

export const POST = (request: Request): Promise<NextResponse> =>
  handleApiPost(
    request,
    { ...API_RATE_LIMITS.logs, fallbackCode: "logReportFailed" },
    parse,
    async ({ entries }, { uid }) => {
      for (const entry of entries) {
        const fields = { ...entry.fields, uid, origin: "client" };
        if (entry.level === "error") {
          log.error(entry.event, entry.message, fields);
        } else {
          log.warn(entry.event, entry.message, fields);
        }
      }

      return new NextResponse(null, { status: 204 });
    },
  );
