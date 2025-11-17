"use client";

import { useAuth } from '@/hooks/use-auth';
import { useEffect, useState } from 'react';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useAuth();
  const [showSlowMessage, setShowSlowMessage] = useState(false);

  // Show slow loading message after 1 second (faster feedback)
  useEffect(() => {
    if (!isLoaded) {
      const timer = setTimeout(() => setShowSlowMessage(true), 1000);
      return () => clearTimeout(timer);
    } else {
      setShowSlowMessage(false);
    }
  }, [isLoaded]);

  // Allow rendering even if full profile isn't loaded yet, as long as we know the role
  // This prevents blocking on slow profile loads when we already have minimal role data
  const canRender = isLoaded && user && user.role === 'admin';

  // Rely on middleware for actual redirects and simply gate rendering here
  if (!canRender) {
    return (
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 container mx-auto p-4 md:p-8 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold">Toegang verifiëren...</p>
            <p className="text-muted-foreground">Een ogenblik geduld alstublieft.</p>
            {showSlowMessage && (
              <p className="text-sm text-muted-foreground mt-2">
                Dit duurt langer dan normaal. Controleer uw internetverbinding.
              </p>
            )}
          </div>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
