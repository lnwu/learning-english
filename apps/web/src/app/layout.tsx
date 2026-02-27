import { Analytics } from "@vercel/analytics/next";
import "./index.css";
import { Inter, Noto_Sans_SC } from "next/font/google";

import type { Metadata } from "next";
import { FC, ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { UserMenu } from "@/components/auth";
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

const RootLayout: FC<{ children: ReactNode }> = async ({ children }) => {
  const session = await auth();

  return (
    <html lang="en" className={`${inter.variable} ${notoSansSC.variable}`}>
      <body className="flex min-h-screen flex-col antialiased">
        <SessionProvider session={session}>
          {session?.user && (
            <header className="border-b">
              <div className="container mx-auto flex items-center justify-between p-4">
                <a href="/home" className="text-xl font-bold hover:text-blue-600 transition-colors cursor-pointer">
                  Learning English
                </a>
                <UserMenu user={session.user} />
              </div>
            </header>
          )}
          <main className="flex flex-1 flex-col items-center justify-center">
            {children}
          </main>
          <Toaster />
        </SessionProvider>
        <Analytics />
      </body>
    </html>
  );
};

export default RootLayout;
