import { Analytics } from "@vercel/analytics/next";
import "./index.css";
import { headers } from "next/headers";

import type { Metadata } from "next";
import { FC, ReactNode } from "react";
import { AuthProvider } from "@/components/auth";
import { AppShell } from "@/components/auth/AppShell";
import { Toaster } from "@/components/ui";
import { detectLocaleFromAcceptLanguage, localeToHtmlLang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "English Learning",
  description: "English Learning App",
};

const RootLayout: FC<{ children: ReactNode }> = async ({ children }) => {
  const acceptLanguage = (await headers()).get("accept-language");
  const locale = detectLocaleFromAcceptLanguage(acceptLanguage);

  return (
    <html lang={localeToHtmlLang(locale)}>
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
