"use client";

import * as React from "react";
import { toast as sonnerToast } from "sonner";

interface ToastParams {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "success" | "destructive";
}

function toast({ title, description, variant }: ToastParams) {
  const options = { description };

  if (variant === "success") {
    sonnerToast.success(title ?? "", options);
  } else if (variant === "destructive") {
    sonnerToast.error(title ?? "", options);
  } else {
    sonnerToast(title ?? "", options);
  }
}

export { toast };
