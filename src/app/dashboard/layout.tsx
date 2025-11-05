
"use client";

import Header from '@/components/Header';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useCallback } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoaded } = useAuth();
  const router = useRouter();

  const redirectToLogin = useCallback(() => {
    if (isLoaded && !user) {
      router.push('/login');
    }
  }, [isLoaded, user, router]);

  useEffect(() => {
    redirectToLogin();
  }, [redirectToLogin]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {!isLoaded || !user ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <p className="text-lg font-semibold">Gebruikersgegevens laden...</p>
              <p className="text-muted-foreground">Een ogenblik geduld alstublieft.</p>
            </div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
