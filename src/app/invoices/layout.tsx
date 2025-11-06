"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/Header";
import { useEffect, useState } from "react";

export default function InvoicesLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useAuth();
  const [showTimeout, setShowTimeout] = useState(false);

  // Show timeout message after 3 seconds if still loading
  useEffect(() => {
    if (!isLoaded) {
      const timer = setTimeout(() => setShowTimeout(true), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowTimeout(false);
    }
  }, [isLoaded]);

  if (!isLoaded || !user || user.role !== "admin") {
    return (
      <div className="flex flex-col min-h-screen">
        <header className="bg-card border-b shadow-sm">
          <div className="container mx-auto flex h-20 items-center justify-between px-4 md:px-6">
            <Skeleton className="h-8 w-48" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold">Toegang verifiëren...</p>
            <p className="text-muted-foreground">Een ogenblik geduld alstublieft.</p>
            {showTimeout && (
              <p className="text-sm text-muted-foreground mt-4">
                Dit duurt langer dan normaal. Controleer uw internetverbinding.
              </p>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto p-4 md:p-8">{children}</main>
    </div>
  );
}

