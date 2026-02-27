import * as React from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks";

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
          "fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50",
          syncing && "animate-pulse",
          className
        )}
        title={syncing ? t('sync.syncing') : `${pendingCount} ${t('sync.pending')}`}
      >
        <div className="flex items-center space-x-2">
          {syncing ? (
            <>
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="text-sm font-medium">{t('sync.syncing')}</span>
            </>
          ) : (
            <>
              <svg 
                className="h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
                />
              </svg>
              <span className="text-sm font-medium">
                {pendingCount} {t('sync.pending')}
              </span>
              {onManualSync && (
                <button
                  onClick={onManualSync}
                  className="ml-2 px-2 py-1 bg-white text-blue-500 rounded text-xs hover:bg-blue-50 transition-colors"
                >
                  {t('sync.syncNow')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
);

SyncIndicator.displayName = "SyncIndicator";

export { SyncIndicator };
