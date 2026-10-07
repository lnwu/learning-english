"use client";

import { useEffect, useState } from "react";
import { useWordsRepo } from "@/hooks/useFirestoreWords";
import { PracticeTimeRecorder } from "@/lib/practiceTime";
import { formatLocalPracticeDate } from "@/lib/practiceDate";

const FLUSH_INTERVAL_MS = 60_000;

export const usePracticeTimeTracker = (): { todaySeconds: number | null } => {
  const repo = useWordsRepo();
  const [baseSeconds, setBaseSeconds] = useState<number | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  useEffect(() => {
    if (!repo) return;

    let cancelled = false;
    let activeDateId = formatLocalPracticeDate(new Date());

    repo
      .loadPracticeSeconds(activeDateId)
      .then((seconds) => {
        if (!cancelled) setBaseSeconds(seconds);
      })
      .catch((error) => {
        console.error("Failed to load practice time:", error);
      });

    const recorder = new PracticeTimeRecorder({
      writeSeconds: (dateId, seconds) => repo.addPracticeTime(dateId, seconds),
      onFlushed: (dateId, seconds) => {
        if (dateId !== activeDateId) {
          activeDateId = dateId;
          setBaseSeconds(0);
          setSessionSeconds(seconds);
          return;
        }
        setSessionSeconds((previous) => previous + seconds);
      },
    });

    const updateActive = () => {
      recorder.setActive(document.visibilityState === "visible" && document.hasFocus());
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

  return { todaySeconds: baseSeconds === null ? null : baseSeconds + sessionSeconds };
};
