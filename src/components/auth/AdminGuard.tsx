"use client";

import { useAuth } from '@/hooks/use-auth';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useAuth();

  // Rely on middleware for actual redirects and simply gate rendering here
  if (!isLoaded || !user || user.role !== 'admin') {
    return (
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 p-4 md:p-8 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold">Toegang verifiëren...</p>
            <p className="text-muted-foreground">Een ogenblik geduld alstublieft.</p>
          </div>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
