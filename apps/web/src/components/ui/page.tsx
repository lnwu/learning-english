import * as React from "react"

import { cn } from "@/lib/utils"
import { Spinner } from "./spinner"

const pageWidths = {
  narrow: "max-w-2xl",
  default: "max-w-5xl",
  wide: "max-w-6xl",
} as const

function PageContainer({
  className,
  width = "default",
  ...props
}: React.ComponentProps<"main"> & { width?: keyof typeof pageWidths }) {
  return (
    <main
      data-slot="page-container"
      className={cn("mx-auto w-full px-4 py-8", pageWidths[width], className)}
      {...props}
    />
  )
}

function PageHeader({
  className,
  title,
  description,
  actions,
  ...props
}: Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-3",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1
          data-slot="page-title"
          className="text-xl font-semibold tracking-tight text-balance"
        >
          {title}
        </h1>
        {description ? (
          <p
            data-slot="page-description"
            className="text-sm text-muted-foreground"
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div
          data-slot="page-actions"
          className="flex shrink-0 flex-wrap items-center gap-2"
        >
          {actions}
        </div>
      ) : null}
    </header>
  )
}

function LoadingState({
  className,
  label,
  ...props
}: React.ComponentProps<"div"> & { label?: React.ReactNode }) {
  return (
    <div
      data-slot="loading-state"
      className={cn(
        "flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground",
        className
      )}
      {...props}
    >
      <Spinner />
      {label ? <span>{label}</span> : null}
    </div>
  )
}

export { PageContainer, PageHeader, LoadingState, pageWidths }
