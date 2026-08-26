import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./index.css";
import { Inter, Noto_Sans_SC } from "next/font/google";
import { cookies, headers } from "next/headers";

import type { Metadata } from "next";
import { FC, ReactNode } from "react";
import { AuthProvider } from "@/components/auth";
import { AppShell } from "@/components/auth/AppShell";
import { WordPicker } from "@/components/word-picker";
import { WordsProvider, LocaleProvider } from "@/hooks";
import { Toaster } from "@/components/ui";
import { detectLocaleFromAcceptLanguage, localeToHtmlLang } from "@/lib/i18n";

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

const RootLayout: FC<{ children: ReactNode }> = async ({ children }) => {
  const cookieLocale = (await cookies()).get("locale")?.value;
  const locale =
    cookieLocale === "zh" || cookieLocale === "en"
      ? cookieLocale
      : detectLocaleFromAcceptLanguage((await headers()).get("accept-language"));

  return (
    <html lang={localeToHtmlLang(locale)} className={`${inter.variable} ${notoSansSC.variable}`}>
      <body className="flex min-h-screen flex-col antialiased">
        <LocaleProvider initialLocale={locale}>
          <AuthProvider>
            <WordsProvider>
              <AppShell>
                {children}
              </AppShell>
              <WordPicker />
              <Toaster position="bottom-right" duration={5000} richColors />
            </WordsProvider>
          </AuthProvider>
        </LocaleProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
};

export default RootLayout;
