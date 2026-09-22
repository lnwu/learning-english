"use client";

import { FC, ReactNode } from "react";
import { useAuth } from "@/hooks";
import { UserMenu } from "@/components/auth";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui";

export const AppShell: FC<{ children: ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== "/login") {
      router.replace("/login");
    }
    if (user && pathname === "/login") {
      router.replace("/home");
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  if (!user && pathname !== "/login") {
    return null;
  }

  return (
    <>
      {user && (
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
            <Link
              href="/home"
              className="text-sm font-semibold tracking-tight transition-colors hover:text-muted-foreground"
            >
              Learning English
            </Link>
            <UserMenu user={user} />
          </div>
        </header>
      )}
      <div className="flex flex-1 flex-col items-center justify-center">
        {children}
      </div>
    </>
  );
};
