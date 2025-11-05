
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { addMonths, subMonths, format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Clock, Briefcase, Thermometer, Coffee, Baby, PartyPopper, User, AlarmClock, Calendar, Sun, BedDouble, Hammer } from 'lucide-react';
import { statusTranslations } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '../ui/skeleton';
import { useMonthlyReport } from '@/hooks/use-monthly-report';

const StatCard = ({ icon: Icon, label, value, unit, isLoading, className }: { icon: React.ElementType, label: string, value: string | number, unit?: string, isLoading: boolean, className?: string }) => (
    <div className={`p-6 rounded-lg flex items-center gap-4 ${className}`}>
        <Icon className="h-8 w-8 text-primary" />
        <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            {isLoading ? (
                <Skeleton className="h-8 w-24 mt-1" />
            ) : (
                <p className="text-2xl font-bold font-headline text-primary">
                    {value} <span className="text-lg font-medium">{unit}</span>
                </p>
            )}
        </div>
    </div>
);

const HourStatCard = ({ icon: Icon, label, value, isLoading }: { icon: React.ElementType, label: string, value: number, isLoading: boolean }) => (
    <div className="p-6 bg-muted/30 rounded-lg text-center flex-1">
        <Icon className="h-8 w-8 text-primary mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">{label}</p>
        {isLoading ? (
             <Skeleton className="h-10 w-24 mx-auto mt-2" />
        ) : (
            <p className="text-4xl font-bold font-headline text-primary">
                {value.toFixed(2)}
            </p>
        )}
    </div>
);

export default function MonthlyReport() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { user, isLoaded: authLoaded } = useAuth();
  const { totals, isLoading } = useMonthlyReport(currentMonth);

  const driverName = user ? `${user.firstName} ${user.lastName}` : '...';
  // Show skeleton if the initial auth check is running OR if the log calculation is running.
  const showSkeleton = isLoading || !authLoaded;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
                <CardTitle className="capitalize-first">
                    {format(currentMonth, 'LLLL yyyy', { locale: nl })}
                </CardTitle>
                <CardDescription className="flex items-center justify-center gap-2 pt-1">
                   <User className="h-4 w-4"/> {user ? driverName : 'Laden...'}
                </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-8 bg-muted/50 rounded-lg flex flex-col items-center justify-center text-center">
             <Clock className="h-12 w-12 text-primary mb-4" />
             <p className="text-sm text-muted-foreground">Totaal uren (incl. 8u voor niet-werkdagen)</p>
             {showSkeleton ? (
                 <Skeleton className="h-12 w-48 mt-2" />
            ) : (
                <p className="text-5xl font-bold font-headline text-primary">
                    {totals.totalHours.toFixed(2)}
                </p>
            )}
        </div>
        <div className="flex flex-col md:flex-row gap-4 justify-between">
            <HourStatCard label="Uren 100%" value={totals.hours100} isLoading={showSkeleton} icon={Clock} />
            <HourStatCard label="Uren 130%" value={totals.hours130} isLoading={showSkeleton} icon={Clock} />
            <HourStatCard label="Uren 150%" value={totals.hours150} isLoading={showSkeleton} icon={Calendar} />
            <HourStatCard label="Uren 200%" value={totals.hours200} isLoading={showSkeleton} icon={Sun} />
            <HourStatCard label="Uren 19%" value={totals.surchargeHours19} isLoading={showSkeleton} icon={AlarmClock} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
           <StatCard icon={Briefcase} label={statusTranslations.gewerkt} value={totals.statusCounts.gewerkt} unit="dagen" isLoading={showSkeleton} className="bg-muted/30" />
           <StatCard icon={Thermometer} label={statusTranslations.ziek} value={totals.statusCounts.ziek} unit="dagen" isLoading={showSkeleton} className="bg-muted/30" />
           <StatCard icon={Coffee} label={statusTranslations.vrij} value={totals.statusCounts.vrij} unit="dagen" isLoading={showSkeleton} className="bg-muted/30" />
           <StatCard icon={Hammer} label="ATV" value={totals.statusCounts.atv} unit="dagen" isLoading={showSkeleton} className="bg-muted/30" />
           <StatCard icon={Baby} label={statusTranslations.ouderschapsverlof} value={totals.statusCounts.ouderschapsverlof} unit="dagen" isLoading={showSkeleton} className="bg-muted/30" />
           <StatCard icon={PartyPopper} label={statusTranslations.feestdag} value={totals.statusCounts.feestdag} unit="dagen" isLoading={showSkeleton} className="bg-muted/30" />
           <StatCard icon={BedDouble} label="Overnachtingen" value={totals.overnightStays} isLoading={showSkeleton} className="bg-muted/30" />
        </div>
      </CardContent>
    </Card>
  );
}
