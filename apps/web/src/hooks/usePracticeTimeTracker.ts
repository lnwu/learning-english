"use client";

import { useEffect, useState } from "react";
import { useWordsRepo } from "@/hooks/useFirestoreWords";
import { createLogger } from "@/lib/log";
import { PracticeTimeRecorder } from "@/lib/practiceTime";
import { formatLocalPracticeDate } from "@/lib/practiceDate";

const log = createLogger({ mod: "practice" });

const FLUSH_INTERVAL_MS = 60_000;

export const usePracticeTimeTracker = (): { todaySeconds: number | null } => {
  const repo = useWordsRepo();
  const [baseSeconds, setBaseSeconds] = useState<number | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // 退出登录时清空累计值：同一个标签页里换账号登录时，上一个账号的 session 秒数
  // 会原样留在 state 里，加到新账号的今日总时长上。repo 变成 null 正好是登出这一刻。
  useEffect(() => {
    if (repo) return;
    setBaseSeconds(null);
    setSessionSeconds(0);
  }, [repo]);

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
        log.error("practice.time.failed", "Failed to load practice time", {}, error);
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
