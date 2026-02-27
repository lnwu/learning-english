"use client";

import { FC, ReactNode } from "react";
import { useAuth } from "@/hooks";
import { UserMenu } from "@/components/auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export const AppShell: FC<{ children: ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {user && (
        <header className="border-b">
          <div className="container mx-auto flex items-center justify-between p-4">
            <a href="/home" className="text-xl font-bold hover:text-blue-600 transition-colors cursor-pointer">
              Learning English
            </a>
            <UserMenu user={user} />
          </div>
        </header>
      )}
      <main className="flex flex-1 flex-col items-center justify-center">
        {children}
      </main>
    </>
  );
};
