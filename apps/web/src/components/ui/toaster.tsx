"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      visibleToasts={3}
      duration={5000}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group pointer-events-auto relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-md border p-4 pr-6 shadow-lg",
        },
      }}
    />
  );
}
