import { Analytics } from "@vercel/analytics/next";
import "./index.css";
import { Inter, Noto_Sans_SC } from "next/font/google";

import type { Metadata } from "next";
import { FC, ReactNode } from "react";
import { AuthProvider } from "@/components/auth";
import { AppShell } from "@/components/auth/AppShell";
import { Toaster } from "@/components/ui";

export const metadata: Metadata = {
  title: "English Learning",
  description: "English Learning App",
};

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const notoSansSC = Noto_Sans_SC({
  weight: ["400", "500", "700"],
  variable: "--font-cjk",
  display: "swap",
});

const RootLayout: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <html lang="en" className={`${inter.variable} ${notoSansSC.variable}`}>
      <body className="flex min-h-screen flex-col antialiased">
        <AuthProvider>
          <AppShell>
            {children}
          </AppShell>
          <Toaster />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
};

export default RootLayout;
