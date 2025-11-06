
"use client";

import { useState, useEffect } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase/client';
import { getYear, getISOWeek } from 'date-fns';
import { Users, FileClock, FileCheck2, CalendarOff, Receipt, Building, BarChart3, Truck, BookText, DollarSign, Briefcase, TrendingUp, Building2, Landmark, ArrowDown, ArrowUp, Calculator, AreaChart, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';


const AdminCard = ({ href, icon: Icon, title, description, badgeCount, needsAttention, disabled }: { href: string, icon: React.ElementType, title: string, description: string, badgeCount?: number, needsAttention?: boolean, disabled?: boolean }) => {
  const content = (
    <Card className={`transition-all duration-300 ease-in-out h-full flex flex-col ${disabled ? 'opacity-50 grayscale cursor-not-allowed' : 'group-hover:shadow-lg group-hover:-translate-y-1 group-hover:shadow-primary/20'}`}>
      <CardHeader className="flex flex-row items-center gap-4 p-4 flex-grow">
        <div className={`bg-primary/10 text-primary p-3 rounded-lg transition-transform duration-300 ease-in-out ${disabled ? '' : 'group-hover:scale-110'}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="text-xs mt-1">{description}</CardDescription>
        </div>
      </CardHeader>
      {badgeCount !== undefined && badgeCount > 0 && !disabled && (
        <Badge variant="destructive" className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center p-1 text-sm rounded-full">
          {badgeCount > 9 ? '9+' : badgeCount}
        </Badge>
      )}
      {needsAttention && !disabled && (
        <div className="absolute top-2 right-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
        </div>
      )}
    </Card>
  );

  if (disabled) {
    return <div className="block relative h-full">{content}</div>;
  }

  return (
    <Link href={href} className="block group relative h-full">
      {content}
    </Link>
  );
};

const DashboardSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {children}
        </div>
    </div>
);


export default function AdminPage() {
    const { user, isLoaded } = useAuth();
    const [pendingDeclarations, setPendingDeclarations] = useState(0);
    const [pendingLeaveRequests, setPendingLeaveRequests] = useState(0);
    const [pendingWeekstates, setPendingWeekstates] = useState(0);
    const [ratesNeedAttention, setRatesNeedAttention] = useState(false);

    useEffect(() => {
        if (!(isLoaded && user?.role === 'admin')) return;

        let active = true;

        const refreshCounts = async () => {
            try {
                const [{ count: declCount }, { count: leaveCount }, { count: weekCount }] = await Promise.all([
                    supabase.from('declarations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
                    supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
                    supabase.from('weekly_logs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
                ]);
                if (!active) return;
                setPendingDeclarations(declCount || 0);
                setPendingLeaveRequests(leaveCount || 0);
                setPendingWeekstates(weekCount || 0);
            } catch (_) {}
        };

        const checkRates = async () => {
            try {
                const currentDate = new Date();
                const weekId = `${getYear(currentDate)}-${getISOWeek(currentDate)}`;
                const { data: custRows } = await supabase
                    .from('customers')
                    .select('id')
                    .in('mileage_rate_type', ['dot', 'variable']);
                const relevantIds = (custRows || []).map(r => r.id);
                if (!active) return;
                if (relevantIds.length === 0) { setRatesNeedAttention(false); return; }
                const { count } = await supabase
                    .from('weekly_rates')
                    .select('*', { count: 'exact', head: true })
                    .eq('week_id', weekId)
                    .in('customer_id', relevantIds);
                setRatesNeedAttention((count || 0) < relevantIds.length);
            } catch (_) {}
        };

        refreshCounts();
        checkRates();

        const channels = [
            supabase.channel('admin-declarations').on('postgres_changes', { event: '*', schema: 'public', table: 'declarations' }, refreshCounts).subscribe(),
            supabase.channel('admin-leave').on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, refreshCounts).subscribe(),
            supabase.channel('admin-weekly').on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_logs' }, refreshCounts).subscribe(),
            supabase.channel('admin-weekly-rates').on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_rates' }, checkRates).subscribe(),
            supabase.channel('admin-customers').on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, checkRates).subscribe(),
        ];

        return () => { active = false; channels.forEach(ch => ch.unsubscribe()); };
    }, [user, isLoaded]);

  return (
    <div className="space-y-8">
        <div className="space-y-2">
            <h1 className="text-3xl font-bold">Admin Commandocentrum</h1>
            <p className="text-muted-foreground">
                Welkom, {user?.firstName}. Hier is een overzicht van de bedrijfsactiviteiten.
            </p>
        </div>

        <div className="space-y-12">
            <DashboardSection title="Financieel">
                <AdminCard 
                    href="/admin/revenue"
                    icon={AreaChart}
                    title="Rapportage"
                    description="Krijg inzicht in de financiële status."
                />
                <AdminCard 
                    href="/invoices"
                    icon={ArrowUp}
                    title="Verkoopfacturen"
                    description="Genereer en beheer hier uw verkoopfacturen."
                />
                <AdminCard 
                    href="/admin/purchases"
                    icon={ArrowDown}
                    title="Inkoopfacturen"
                    description="Beheer hier uw inkoopfacturen."
                />
                <AdminCard 
                    href="/admin/rates"
                    icon={TrendingUp}
                    title="Tarievenbeheer"
                    description="Beheer wekelijkse DOT% en vaste tarieven."
                    needsAttention={ratesNeedAttention}
                />
                <AdminCard
                    href="/admin/bank"
                    icon={Landmark}
                    title="Bank"
                    description="Importeer banktransacties en koppel betalingen."
                    disabled={true}
                />
                <AdminCard
                    href="#"
                    icon={AreaChart}
                    title="Liquiditeitsprognose"
                    description="Krijg inzicht in de toekomstige cashflow (in ontwikkeling)."
                    disabled={true}
                />
                 <AdminCard 
                    href="/admin/cost-calculation"
                    icon={Calculator}
                    title="Kostprijsberekening"
                    description="Bereken de kostprijs per voertuig."
                />
                 <AdminCard 
                    href="/admin/ritprijsberekening"
                    icon={Calculator}
                    title="Ritprijsberekening"
                    description="Bereken de ritprijs per voertuig."
                    disabled={true}
                />
            </DashboardSection>

            <DashboardSection title="Personeelszaken">
                <AdminCard 
                    href="/admin/users"
                    icon={Users}
                    title="Medewerkers"
                    description="Medewerkers toevoegen, activeren en beheren."
                />
                <AdminCard 
                    href="/admin/payroll"
                    icon={DollarSign}
                    title="Salarisadministratie"
                    description="Genereer een Excel-export voor de salarisadministratie."
                />
                <AdminCard 
                    href="/admin/weekstates"
                    icon={FileClock}
                    title="Weekstaten"
                    description="Keur weekstaten goed en exporteer."
                    badgeCount={pendingWeekstates}
                />
                <AdminCard 
                    href="/admin/declarations"
                    icon={FileCheck2}
                    title="Declaratiebeheer"
                    description="Keur declaraties van medewerkers goed of af."
                    badgeCount={pendingDeclarations}
                />
                <AdminCard 
                    href="/admin/leave"
                    icon={CalendarOff}
                    title="Verlofbeheer"
                    description="Beheer en keur verlofaanvragen."
                    badgeCount={pendingLeaveRequests}
                />
                <AdminCard
                href="/admin/fines"
                icon={Receipt}
                title="Boetebeheer"
                description="Voeg boetes voor chauffeurs toe."
                />
            </DashboardSection>

            <DashboardSection title="Relatiebeheer">
            <AdminCard 
                    href="/admin/customers"
                    icon={Building}
                    title="Klanten"
                    description="Voeg nieuwe klanten toe en beheer."
                />
                <AdminCard
                href="/admin/suppliers"
                icon={Building2}
                title="Leveranciers"
                description="Beheer hier uw leveranciers."
                />
            </DashboardSection>

                <DashboardSection title="Wagenpark">
                    <AdminCard 
                        href="/admin/fleet"
                        icon={Truck}
                        title="Wagenparkbeheer"
                        description="Voeg nieuwe voertuigen toe en beheer."
                    />
                     <AdminCard 
                        href="/schade"
                        icon={ShieldAlert}
                        title="Schade Melden"
                        description="Meld hier eventuele schade aan een voertuig."
                        disabled={true}
                    />
                </DashboardSection>

            <DashboardSection title="Algemeen">
                <AdminCard
                href="/admin/policy"
                icon={BookText}
                title="Boetebeleid"
                description="Stel het bedrijfsbeleid voor boetes in."
                />
                <AdminCard
                    href="/admin/company"
                    icon={Briefcase}
                    title="Bedrijfsprofiel"
                    description="Beheer uw bedrijfsgegevens en logo."
                />
            </DashboardSection>
        </div>
    </div>
  );

}
