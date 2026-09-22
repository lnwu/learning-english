"use client";

import dynamic from "next/dynamic";

export const WordPickerLazy = dynamic(() => import("./WordPicker"), {
  ssr: false,
});
