
"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, memo } from "react";
import React from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, CalendarClock, Coins, CalendarOff, Receipt, ShieldAlert } from "lucide-react";
import HorizontalLogo from "./HorizontalLogo";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NavButton = memo(({ href, children, currentPath }: { href: string, children: React.ReactNode, currentPath: string }) => {
    const isActive = currentPath.startsWith(href);
    return (
        <Button variant="link" asChild className={cn(isActive ? "text-primary font-semibold" : "text-muted-foreground", "hover:text-primary transition-colors")}>
            <Link href={href}>{children}</Link>
        </Button>
    );
});
NavButton.displayName = 'NavButton';


export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoaded } = useAuth();
  const [pendingWeekstates, setPendingWeekstates] = useState(0);
  const [pendingDeclarations, setPendingDeclarations] = useState(0);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState(0);
  const [newFinesCount, setNewFinesCount] = useState(0);

  // Early guard: if local session is stale (invalid refresh token), sign out and redirect.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { error } = await supabase.auth.getUser();
        if (!active) return;
        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('invalid refresh token') || msg.includes('refresh token not found')) {
            try { await supabase.auth.signOut(); } catch {}
            if (active) router.replace('/login');
          }
        }
      } catch (_) {
        // ignore
      }
    })();
    return () => { active = false; };
  }, [router]);

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
        // Add shorter timeout for faster feedback
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 2000)
        );
        
        // Use count queries - faster than selecting all rows
        const queriesPromise = Promise.all([
          supabase.from('weekly_logs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('declarations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
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
    
    // Listen for custom refresh events from admin actions
    const handleRefreshEvent = () => {
      refreshCounts();
    };
    
    window.addEventListener('admin-action-completed', handleRefreshEvent);
    
    // Supabase realtime subscriptions with better filters
    const channels = [
      supabase.channel('hdr-weekly-logs')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'weekly_logs',
          filter: 'status=eq.pending'
        }, refreshCounts)
        .subscribe(),
      supabase.channel('hdr-declarations')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'declarations',
          filter: 'status=eq.pending'
        }, refreshCounts)
        .subscribe(),
      supabase.channel('hdr-leave')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'leave_requests',
          filter: 'status=eq.pending'
        }, refreshCounts)
        .subscribe(),
      // Also listen for updates that might change status FROM pending
      supabase.channel('hdr-weekly-logs-updates')
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'weekly_logs'
        }, refreshCounts)
        .subscribe(),
      supabase.channel('hdr-declarations-updates')
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'declarations'
        }, refreshCounts)
        .subscribe(),
      supabase.channel('hdr-leave-updates')
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'leave_requests'
        }, refreshCounts)
        .subscribe(),
    ];
    
    return () => { 
      active = false;
      window.removeEventListener('admin-action-completed', handleRefreshEvent);
      channels.forEach(ch => ch.unsubscribe()); 
    };
  }, [user, isLoaded]);

  // Listen for new fines for non-admin users
  useEffect(() => {
    if (!(isLoaded && user && user.role !== 'admin')) {
      setNewFinesCount(0);
      return;
    }

    let active = true;
    const currentUser = user;

    // Check for new fines (created in last 24 hours)
    const checkNewFines = async () => {
      try {
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        
        const { count, error } = await supabase
          .from('fines')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', currentUser.uid)
          .gte('created_at', yesterday.toISOString());
        
        if (!active) return;
        
        if (!error && count !== null) {
          setNewFinesCount(count);
        }
      } catch (error) {
        console.debug('[Header] Failed to check new fines:', error);
      }
    };

    // Initial check
    checkNewFines();

    // Subscribe to new fines
    const finesChannel = supabase
      .channel(`hdr-fines-${currentUser.uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'fines',
          filter: `user_id=eq.${currentUser.uid}`,
        },
        () => {
          if (!active) return;
          // Refresh count when new fine is inserted
          checkNewFines();
        }
      )
      .subscribe();

    return () => {
      active = false;
      finesChannel.unsubscribe();
    };
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
    <header className="bg-card border-b shadow-sm sticky top-0 z-50">
      <div className="container mx-auto">
        <div className="flex flex-col gap-3 md:gap-4 py-3 md:py-2 px-4 md:px-6">
          {/* Top Row: Logo, Admin and Logout */}
          <div className="flex items-center justify-between gap-2">
            {/* Logo */}
            <div className="flex-shrink-0">
              <Link href="/dashboard">
                <HorizontalLogo />
              </Link>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-2">
              {user?.role === 'admin' && (
                <Button variant="outline" size="sm" asChild className="relative">
                  <Link href="/admin">
                    <Shield className="mr-1.5 md:mr-2 h-4 w-4" />
                    <span>Admin</span>
                    {totalPending > 0 && (
                      <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-1 text-xs rounded-full">
                        {totalPending}
                      </Badge>
                    )}
                  </Link>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 md:gap-2">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Uitloggen</span>
              </Button>
            </div>
          </div>

          {/* Bottom Row: Main Navigation */}
          <nav className="flex items-center gap-1 md:gap-2 flex-wrap md:flex-nowrap justify-center md:justify-center">
            <NavButton href="/timesheets" currentPath={pathname}>
              <CalendarClock className="mr-1.5 md:mr-2 h-4 w-4" /> 
              <span>Uren</span>
            </NavButton>
            <NavButton href="/leave" currentPath={pathname}>
              <CalendarOff className="mr-1.5 md:mr-2 h-4 w-4" /> 
              <span>Verlof</span>
            </NavButton>
            <NavButton href="/declarations" currentPath={pathname}>
              <Coins className="mr-1.5 md:mr-2 h-4 w-4" /> 
              <span>Declaraties</span>
            </NavButton>
            <NavButton href="/fines" currentPath={pathname}>
              <div className="flex items-center gap-1.5 md:gap-2 relative">
                <Receipt className="h-4 w-4" />
                <span>Boetes</span>
                {newFinesCount > 0 && (
                  <Badge variant="destructive" className="h-5 w-5 flex items-center justify-center p-1 text-xs rounded-full ml-1">
                    {newFinesCount > 9 ? '9+' : newFinesCount}
                  </Badge>
                )}
              </div>
            </NavButton>
            <NavButton href="/schade" currentPath={pathname}>
              <ShieldAlert className="mr-1.5 md:mr-2 h-4 w-4" /> 
              <span>Schade</span>
            </NavButton>
          </nav>
        </div>
      </div>
    </header>
  );
}
