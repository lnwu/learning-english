"use client";

import dynamic from "next/dynamic";

export const Toaster = dynamic(() => import("./sonner").then((m) => m.Toaster), {
  ssr: false,
});
