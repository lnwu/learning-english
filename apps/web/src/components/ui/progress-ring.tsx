"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cn } from "@/lib/utils";

interface ProgressRingProps extends Omit<ProgressPrimitive.Root.Props, "children" | "value"> {
  /** Completion from 0 to 100 */
  value: number;
  size?: number;
  strokeWidth?: number;
}

function ProgressRing({
  className,
  value,
  size = 20,
  strokeWidth = 3,
  ...props
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress-ring"
      className={cn("inline-flex shrink-0", className)}
      {...props}
    >
      <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-border"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
            className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </g>
      </svg>
    </ProgressPrimitive.Root>
  );
}

export { ProgressRing };
