import * as React from "react";
import { UploadIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks";
import { Button } from "./button";
import { Spinner } from "./spinner";

interface SyncIndicatorProps {
  syncing: boolean;
  pendingCount?: number;
  onManualSync?: () => void;
  className?: string;
}

const SyncIndicator = React.forwardRef<HTMLDivElement, SyncIndicatorProps>(
  ({ syncing, pendingCount = 0, onManualSync, className }, ref) => {
    const { t } = useLocale();

    if (pendingCount === 0 && !syncing) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md",
          className,
        )}
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
        {!syncing && onManualSync && (
          <Button variant="outline" size="xs" onClick={onManualSync}>
            {t("sync.syncNow")}
          </Button>
        )}
      </div>
    );
  },
);

SyncIndicator.displayName = "SyncIndicator";

export { SyncIndicator };
