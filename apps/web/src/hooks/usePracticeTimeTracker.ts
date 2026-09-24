"use client";

import { useEffect } from "react";
import { useWordsRepo } from "@/hooks/useFirestoreWords";
import { PracticeTimeRecorder } from "@/lib/practiceTime";

const FLUSH_INTERVAL_MS = 60_000;

export const usePracticeTimeTracker = () => {
  const repo = useWordsRepo();

  useEffect(() => {
    if (!repo) return;

    const recorder = new PracticeTimeRecorder({
      writeSeconds: (dateId, seconds) => repo.addPracticeTime(dateId, seconds),
    });

    const updateActive = () => {
      recorder.setActive(
        document.visibilityState === "visible" && document.hasFocus()
      );
    };

    const flush = () => {
      void recorder.flush();
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
