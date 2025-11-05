
"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, Home, CalendarClock, Coins, CalendarOff, Receipt, FileText, ShieldAlert } from "lucide-react";
import HorizontalLogo from "./HorizontalLogo";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NavButton = ({ href, children, currentPath }: { href: string, children: React.ReactNode, currentPath: string }) => {
    const isActive = currentPath.startsWith(href);
    return (
        <Button variant="link" asChild className={cn(isActive ? "text-primary font-semibold" : "text-muted-foreground", "hover:text-primary transition-colors")}>
            <Link href={href}>{children}</Link>
        </Button>
    );
};


export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoaded } = useAuth();
  const [pendingWeekstates, setPendingWeekstates] = useState(0);
  const [pendingDeclarations, setPendingDeclarations] = useState(0);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState(0);

  useEffect(() => {
    if (!(isLoaded && user?.role === 'admin')) {
      setPendingWeekstates(0);
      setPendingDeclarations(0);
      setPendingLeaveRequests(0);
      return;
    }

    let active = true;

    const refreshCounts = async () => {
      try {
        // Add timeout to prevent blocking
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        );
        
        const queriesPromise = Promise.all([
          supabase.from('weekly_logs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('declarations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        ]);
        
        const [{ count: weekCount }, { count: declCount }, { count: leaveCount }] = await Promise.race([
          queriesPromise,
          timeoutPromise
        ]) as any;
        
        if (!active) return;
        setPendingWeekstates(weekCount || 0);
        setPendingDeclarations(declCount || 0);
        setPendingLeaveRequests(leaveCount || 0);
      } catch (error) {
        // Silently fail - don't block the page
        console.debug('[Header] Failed to fetch pending counts:', error);
        // Set to 0 on error so badge doesn't show incorrectly
        if (!active) return;
        setPendingWeekstates(0);
        setPendingDeclarations(0);
        setPendingLeaveRequests(0);
      }
    };

    refreshCounts();
    const channels = [
      supabase.channel('hdr-weekly-logs').on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_logs' }, refreshCounts).subscribe(),
      supabase.channel('hdr-declarations').on('postgres_changes', { event: '*', schema: 'public', table: 'declarations' }, refreshCounts).subscribe(),
      supabase.channel('hdr-leave').on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, refreshCounts).subscribe(),
    ];
    return () => { active = false; channels.forEach(ch => ch.unsubscribe()); };
  }, [user, isLoaded]);
  
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push("/login");
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const totalPending = pendingWeekstates + pendingDeclarations + pendingLeaveRequests;

  return (
    <header className="bg-card border-b shadow-sm">
      <div className="container mx-auto flex h-auto min-h-20 flex-wrap items-center justify-between py-2 px-4 md:px-6">
        <Link href="/dashboard">
          <HorizontalLogo />
        </Link>
        <nav className="flex items-center gap-x-2 flex-wrap justify-end">
             <NavButton href="/dashboard" currentPath={pathname}>
                <Home className="mr-2 h-4 w-4" /> Home
            </NavButton>
            <NavButton href="/timesheets" currentPath={pathname}>
                <CalendarClock className="mr-2 h-4 w-4" /> Uren
            </NavButton>
            <NavButton href="/leave" currentPath={pathname}>
                <CalendarOff className="mr-2 h-4 w-4" /> Verlof
            </NavButton>
             <NavButton href="/declarations" currentPath={pathname}>
                <Coins className="mr-2 h-4 w-4" /> Declaraties
            </NavButton>
             <NavButton href="/fines" currentPath={pathname}>
                <Receipt className="mr-2 h-4 w-4" /> Boetes
            </NavButton>
             <NavButton href="/schade" currentPath={pathname}>
                <ShieldAlert className="mr-2 h-4 w-4" /> Schade Melden
            </NavButton>

            <div className="w-px h-6 bg-border mx-2 hidden md:block"></div>
            
            {user?.role === 'admin' && (
                <Button variant="outline" asChild>
                    <Link href="/admin" className="relative">
                        <Shield className="mr-2 h-4 w-4" />
                        Admin
                        {totalPending > 0 && (
                            <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-1 text-xs rounded-full">
                                {totalPending}
                            </Badge>
                        )}
                    </Link>
                </Button>
            )}
            <Button variant="ghost" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Uitloggen
            </Button>
        </nav>
      </div>
    </header>
  );
}
