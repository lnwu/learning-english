"use client";

import { UploadIcon } from "lucide-react";
import { useFirestoreWords, useLocale, useSyncStatus } from "@/hooks";
import { Button } from "./button";
import { Spinner } from "./spinner";

const SyncIndicator = () => {
  const { syncing, pendingCount } = useSyncStatus();
  const { syncToFirestore } = useFirestoreWords();
  const { t } = useLocale();

  if (pendingCount === 0 && !syncing) return null;

  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
      title={syncing ? t("sync.syncing") : `${pendingCount} ${t("sync.pending")}`}
    >
      {syncing ? (
        <Spinner className="text-muted-foreground" />
      ) : (
        <UploadIcon className="size-4 text-muted-foreground" />
      )}
      <span className="font-medium">
        {syncing ? t("sync.syncing") : `${pendingCount} ${t("sync.pending")}`}
      </span>
      {!syncing && (
        <Button variant="outline" size="xs" onClick={syncToFirestore}>
          {t("sync.syncNow")}
        </Button>
      )}
    </div>
  );
};

export { SyncIndicator };
