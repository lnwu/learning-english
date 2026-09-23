"use client";

import { useState, useEffect, useMemo, type ReactNode, FC } from "react";
import { getAuthInstance, onAuthStateChanged, isPreviewEnv, signInAnonymously, type User } from "@/lib/firebase";
import { AuthContext } from "@/hooks/useAuth";

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuthInstance(), (firebaseUser) => {
      if (!firebaseUser && isPreviewEnv) {
        signInAnonymously().catch((err) => {
          console.error("Anonymous sign-in failed:", err);
          setLoading(false);
        });
        return;
      }
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = useMemo(() => ({ user, loading }), [user, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
