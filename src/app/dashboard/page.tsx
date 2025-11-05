"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useUserCollection } from '@/hooks/use-user-collection';
import { getISOWeek, getYear, subWeeks } from 'date-fns';
import type { WeeklyLog } from '@/lib/types';
import { CheckCircle, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

const ToDoItem = ({ weekId, log }: { weekId: string, log: WeeklyLog | undefined }) => {
    const isDone = log?.status === 'pending' || log?.status === 'approved';
    const [year, week] = weekId.split('-');
    
    return (
        <div className="flex items-center justify-between p-4 border-b last:border-b-0">
            <div className="flex items-center gap-4">
                {isDone ? <CheckCircle className="h-6 w-6 text-green-500" /> : <Edit className="h-6 w-6 text-primary" />}
                <div>
                    <p className="font-medium">Week {week} - {year}</p>
                    <p className="text-sm text-muted-foreground">{isDone ? 'Ingevuld en verzonden' : 'Weekstaat invullen'}</p>
                </div>
            </div>
             <Button variant="outline" asChild>
                <Link href={`/timesheets?week=${weekId}`}>
                    {isDone ? 'Bekijken' : 'Invullen'}
                </Link>
            </Button>
        </div>
    )
}

export default function DashboardPage() {
    const { user } = useAuth();
    const { documents: logs, loading: logsLoading } = useUserCollection<WeeklyLog>('truckLogs');
    const [weeks, setWeeks] = useState<string[]>([]);
    
    useEffect(() => {
        const today = new Date();
        const relevantWeeks: string[] = [];
        for (let i = 0; i < 4; i++) {
            const date = subWeeks(today, i);
            const weekId = `${getYear(date)}-${getISOWeek(date)}`;
            relevantWeeks.push(weekId);
        }
        setWeeks(relevantWeeks);
    }, []);

    const findLogForWeek = (weekId: string): WeeklyLog | undefined => {
        return logs.find(log => log.weekId === weekId);
    }
    
    return (
        <div className="w-full max-w-[90%] mx-auto p-4 md:p-8 space-y-8">
             <div className="space-y-2">
                <h1 className="text-3xl font-bold">Welkom, {user?.firstName}!</h1>
                <p className="text-muted-foreground">
                   Hier is een overzicht van uw openstaande taken.
                </p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Mijn Chauffeurstaken</CardTitle>
                    <CardDescription>
                        Weekstaten van de oude week worden in de nieuwe week om 12:00 uur afgesloten.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {logsLoading ? (
                        <div className="p-4 space-y-2">
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                        </div>
                    ) : (
                        weeks.map(weekId => (
                            <ToDoItem key={weekId} weekId={weekId} log={findLogForWeek(weekId)} />
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
