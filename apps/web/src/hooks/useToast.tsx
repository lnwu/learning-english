"use client";

import * as React from "react";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";

type ToastVariant = "default" | "success" | "destructive";

interface ToastParams {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  action?: React.ReactNode;
}

const variantClassName: Record<ToastVariant, string> = {
  default: "border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100",
  success: "border-green-500 bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-100",
  destructive: "border-red-500 bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100",
};

function toast({ title, description, variant = "default", action }: ToastParams) {
  const content = (
    <div className="grid gap-1">
      {title != null && <div className="text-sm font-semibold">{title}</div>}
      {description != null && <div className="text-sm opacity-90">{description}</div>}
    </div>
  );

  const id = sonnerToast(
    <div className="flex w-full items-start justify-between gap-2">
      {content}
      {action}
      <button
        type="button"
        aria-label="Close"
        onClick={() => sonnerToast.dismiss(id)}
        className="absolute right-1 top-1 rounded-md p-1 text-gray-500 opacity-0 transition-opacity hover:text-gray-900 focus:opacity-100 focus:outline-none group-hover:opacity-100 dark:text-gray-400 dark:hover:text-gray-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>,
    {
      unstyled: true,
      className: cn(variantClassName[variant]),
      duration: 5000,
    }
  );

  return {
    id,
    dismiss: () => sonnerToast.dismiss(id),
  };
}

export { toast };
