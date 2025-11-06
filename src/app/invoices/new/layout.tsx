
"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';

export default function NewInvoiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoaded } = useAuth();

  useEffect(() => {
    if (isLoaded) {
      if (!user) {
        router.replace('/login');
      } else if (user.role !== 'admin') {
        router.replace('/dashboard');
      }
    }
  }, [user, isLoaded, router]);

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

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">{children}</main>
    </div>
  );
}
