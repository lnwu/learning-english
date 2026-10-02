import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingRowProps {
  title: ReactNode;
  description: ReactNode;
  destructive?: boolean;
  className?: string;
  children: ReactNode;
}

export const SettingRow = ({
  title,
  description,
  destructive,
  className,
  children,
}: SettingRowProps) => (
  <div
    className={cn(
      "flex flex-col gap-2 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
      className,
    )}
  >
    <div className="flex flex-col gap-1">
      <h3 className={cn("text-sm font-medium", destructive && "text-destructive")}>{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    <div className="shrink-0 self-start sm:self-auto">{children}</div>
  </div>
);
