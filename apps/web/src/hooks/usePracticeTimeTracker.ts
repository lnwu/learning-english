"use client";

import { useEffect } from "react";
import { useWordsRepo } from "@/hooks/useFirestoreWords";
import { formatLocalPracticeDate } from "@/lib/practiceDate";
import { ActiveTimeTracker } from "@/lib/practiceTime";

const FLUSH_INTERVAL_MS = 60_000;

export const usePracticeTimeTracker = () => {
  const repo = useWordsRepo();

  useEffect(() => {
    if (!repo) return;

    const tracker = new ActiveTimeTracker();
    let pendingSeconds = 0;

    const updateActive = () => {
      tracker.setActive(
        document.visibilityState === "visible" && document.hasFocus()
      );
    };

    const flush = async () => {
      pendingSeconds += tracker.takePendingMs() / 1000;
      const wholeSeconds = Math.floor(pendingSeconds);
      if (wholeSeconds <= 0) return;
      pendingSeconds -= wholeSeconds;
      const dateId = formatLocalPracticeDate(new Date());
      try {
        await repo.addPracticeTime(dateId, wholeSeconds);
      } catch (err) {
        console.error("Failed to record practice time:", err);
        pendingSeconds += wholeSeconds;
      }
    };

    const handleVisibilityChange = () => {
      updateActive();
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    updateActive();
    const timer = setInterval(flush, FLUSH_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", updateActive);
    window.addEventListener("blur", updateActive);
    window.addEventListener("pagehide", flush);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", updateActive);
      window.removeEventListener("blur", updateActive);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [repo]);
};
