"use client";

import { useEffect } from "react";
import { doc, increment, setDoc } from "firebase/firestore";
import { db, getEffectiveUserId } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { formatLocalPracticeDate } from "@/lib/practiceDate";
import { ActiveTimeTracker } from "@/lib/practiceTime";

const FLUSH_INTERVAL_MS = 60_000;

export const usePracticeTimeTracker = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const userId = getEffectiveUserId(user);
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
        await setDoc(
          doc(db, "users", userId, "practiceTime", dateId),
          { seconds: increment(wholeSeconds) },
          { merge: true }
        );
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
  }, [user]);
};
