
"use client";

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useUserCollection } from '@/hooks/use-user-collection';
import type { WeeklyLog, WeeklyLogStatus, LeaveRequest } from '@/lib/types';
import { format, addMonths, subMonths, startOfMonth, getDay, isSameDay, parseISO, isWithinInterval, endOfMonth, eachDayOfInterval, getYear, startOfWeek } from 'date-fns';
import { getCustomWeek, getCustomWeekYear } from '@/lib/utils';
import { nl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Circle, CheckCircle, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChartContainer, ChartConfig, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell } from 'recharts';
import { Skeleton } from '../ui/skeleton';
import { holidays } from '@/lib/holidays';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

const LegendItem = ({ icon: Icon, text, colorClass }: { icon: React.ElementType, text: string, colorClass: string }) => (
    <div className="flex items-center gap-2">
        <Icon className={cn("h-3 w-3", colorClass)} />
        <span className="text-xs text-muted-foreground">{text}</span>
    </div>
);

const chartConfig = {
  approved: {
    label: 'Goedgekeurd',
    color: "hsl(142.1 76.2% 36.3%)",
  },
  pending: {
    label: 'In behandeling',
    color: "hsl(35.8 91.7% 50.4%)",
  },
  concept: {
    label: 'Concept',
    color: "hsl(204 70% 53%)",
  },
  unfilled: {
    label: 'Open',
    color: 'hsl(var(--muted))',
  },
} satisfies ChartConfig;

export default function MonthlyCalendar() {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const { user, isLoaded } = useAuth();
    const { documents: weeklyLogs, loading: logsLoading } = useUserCollection<WeeklyLog>('truckLogs');
    const [approvedLeaveRequests, setApprovedLeaveRequests] = useState<LeaveRequest[]>([]);
    const router = useRouter();

    // Fetch approved leave requests
    useEffect(() => {
        if (!user?.uid) return;

        const fetchLeaveRequests = async () => {
            const { data, error } = await supabase
                .from('leave_requests')
                .select('*')
                .eq('user_id', user.uid)
                .eq('status', 'approved');

            if (error) {
                console.error('Error fetching leave requests:', error);
                return;
            }

            const mapped = (data || []).map((r: any) => ({
                id: r.id,
                userId: r.user_id,
                userFirstName: '',
                userLastName: '',
                userEmail: '',
                startDate: r.start_date,
                endDate: r.end_date,
                type: r.type,
                reason: r.reason,
                status: r.status,
                submittedAt: r.submitted_at,
                rejectionReason: r.rejection_reason || undefined,
            })) as LeaveRequest[];

            setApprovedLeaveRequests(mapped);
        };

        fetchLeaveRequests();
    }, [user?.uid]);

    // Bereken maanden voor 3-maanden view (eerst definiëren)
    const prevMonth = useMemo(() => subMonths(currentMonth, 1), [currentMonth]);
    const nextMonth = useMemo(() => addMonths(currentMonth, 1), [currentMonth]);
    
    // Bereken weekstatussen voor duidelijk overzicht - alle weken die overlappen met de 3 maanden
    const weekStatusMap = useMemo(() => {
        const map = new Map<string, WeeklyLogStatus>();
        if (weeklyLogs) {
            weeklyLogs.forEach(log => {
                if (log.days && log.days.length > 0) {
                    // Check of de week overlapt met een van de 3 maanden (vorige, huidige, volgende)
                    const hasDayInVisibleMonths = log.days.some(day => {
                        const dayDate = parseISO(day.date);
                        const monthKey = format(dayDate, 'yyyy-MM');
                        const prevMonthKey = format(prevMonth, 'yyyy-MM');
                        const currentMonthKey = format(currentMonth, 'yyyy-MM');
                        const nextMonthKey = format(nextMonth, 'yyyy-MM');
                        return monthKey === prevMonthKey || monthKey === currentMonthKey || monthKey === nextMonthKey;
                    });
                    if (hasDayInVisibleMonths) {
                        map.set(log.weekId, log.status);
                    }
                }
            });
        }
        return map;
    }, [weeklyLogs, currentMonth, prevMonth, nextMonth]);
    
    // Helper functie om modifiers per maand te berekenen
    const getModifiersForMonth = useMemo(() => {
        return (targetMonth: Date) => {
            const modifiers: { [key: string]: Date[] } = {
                approved: [],
                pending: [],
                concept: [],
                leave: [], // Add leave modifier
            };
            
            if (!weeklyLogs) {
                // Still check for leave even if no logs
                if (approvedLeaveRequests.length > 0) {
                    const monthStart = startOfMonth(targetMonth);
                    const monthEnd = endOfMonth(targetMonth);
                    const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

                    allDaysInMonth.forEach(day => {
                        const dayOfWeek = getDay(day);
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        const isHoliday = holidays.some(h => isSameDay(h.date, day));

                        if (!isWeekend && !isHoliday) {
                            const hasLeave = approvedLeaveRequests.some(leave => {
                                const leaveStart = parseISO(leave.startDate);
                                const leaveEnd = parseISO(leave.endDate);
                                return isWithinInterval(day, { start: leaveStart, end: leaveEnd });
                            });
                            if (hasLeave) {
                                modifiers.leave.push(day);
                            }
                        }
                    });
                }
                return modifiers;
            }

            weeklyLogs.forEach(log => {
                // Check if log.days exists and is an array before iterating
                if (!log.days || !Array.isArray(log.days)) return;
                
                log.days.forEach(day => {
                    const dayDate = parseISO(day.date);
                    if (format(dayDate, 'yyyy-MM') === format(targetMonth, 'yyyy-MM')) {
                        const dayOfWeek = getDay(dayDate);
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        const isHoliday = holidays.some(h => isSameDay(h.date, dayDate));

                        if (!isWeekend && !isHoliday) {
                            // Check if this day has approved leave
                            const hasLeave = approvedLeaveRequests.some(leave => {
                                const leaveStart = parseISO(leave.startDate);
                                const leaveEnd = parseISO(leave.endDate);
                                return isWithinInterval(dayDate, { start: leaveStart, end: leaveEnd });
                            });

                            if (hasLeave) {
                                // Leave takes priority over log status
                                modifiers.leave.push(dayDate);
                            } else if (log.status === 'approved') {
                                modifiers.approved.push(dayDate);
                            } else if (log.status === 'pending') {
                                modifiers.pending.push(dayDate);
                            } else if (log.status === 'concept') {
                                modifiers.concept.push(dayDate);
                            }
                        }
                    }
                });
            });

            // Also check for days without logs but with leave
            const monthStart = startOfMonth(targetMonth);
            const monthEnd = endOfMonth(targetMonth);
            const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

            allDaysInMonth.forEach(day => {
                const dayOfWeek = getDay(day);
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isHoliday = holidays.some(h => isSameDay(h.date, day));
                
                if (!isWeekend && !isHoliday) {
                    // Check if day already has a modifier from logs
                    const hasModifier = modifiers.approved.includes(day) || 
                                       modifiers.pending.includes(day) || 
                                       modifiers.concept.includes(day) ||
                                       modifiers.leave.includes(day);
                    
                    if (!hasModifier) {
                        // Check if this day has approved leave but no log entry
                        const hasLeave = approvedLeaveRequests.some(leave => {
                            const leaveStart = parseISO(leave.startDate);
                            const leaveEnd = parseISO(leave.endDate);
                            return isWithinInterval(day, { start: leaveStart, end: leaveEnd });
                        });
                        if (hasLeave) {
                            modifiers.leave.push(day);
                        }
                    }
                }
            });
            
            return modifiers;
        };
    }, [weeklyLogs, approvedLeaveRequests]);
    
    const prevModifiers = useMemo(() => getModifiersForMonth(prevMonth), [getModifiersForMonth, prevMonth]);
    const currentModifiers = useMemo(() => getModifiersForMonth(currentMonth), [getModifiersForMonth, currentMonth]);
    const nextModifiers = useMemo(() => getModifiersForMonth(nextMonth), [getModifiersForMonth, nextMonth]);
    
     const { statusCounts, totalWorkDays, filledDays } = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: endOfMonth(currentMonth) });

        const workDaysInMonth: Date[] = allDaysInMonth.filter(date => {
            const dayOfWeek = getDay(date);
            const isHoliday = holidays.some(h => isSameDay(h.date, date));
            return dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday;
        });

        const dayStatusMap = new Map<string, WeeklyLogStatus>();
        const statusPriority = { approved: 3, pending: 2, concept: 1 };

        if (weeklyLogs) {
            weeklyLogs.forEach(log => {
                // Check if log.days exists and is an array before using it
                if (!log.days || !Array.isArray(log.days)) return;
                
                const isRelevantLog = log.days.some(day => format(parseISO(day.date), 'yyyy-MM') === format(currentMonth, 'yyyy-MM'));
                if (isRelevantLog) {
                    workDaysInMonth.forEach(workDay => {
                         const dateString = format(workDay, 'yyyy-MM-dd');
                         const logWeekId = `${getCustomWeekYear(workDay)}-${getCustomWeek(workDay)}`;

                         if(log.weekId === logWeekId) {
                            const currentStatus = dayStatusMap.get(dateString);
                            const newStatus = log.status;
                            
                            if (!currentStatus || statusPriority[newStatus] > (statusPriority[currentStatus] || 0) ) {
                                dayStatusMap.set(dateString, newStatus);
                            }
                         }
                    });
                }
            });
        }
        
        const counts = { approved: 0, pending: 0, concept: 0 };
        workDaysInMonth.forEach(workDay => {
            const dateString = format(workDay, 'yyyy-MM-dd');
            const status = dayStatusMap.get(dateString);
            if (status && counts.hasOwnProperty(status)) {
                counts[status]++;
            }
        });
        
        return { 
            statusCounts: counts,
            totalWorkDays: workDaysInMonth.length,
            filledDays: counts.approved + counts.pending + counts.concept
        };

    }, [currentMonth, weeklyLogs]);
    
    const filledPercentage = totalWorkDays > 0 ? (filledDays / totalWorkDays) * 100 : 0;
    
    // Helper function to handle day click and navigate to weekstaat
    const handleDaySelect = (date: Date | undefined) => {
        if (!date) return;
        
        // Calculate weekId from the clicked date
        const weekStart = startOfWeek(date, { weekStartsOn: 1 });
        const year = getCustomWeekYear(weekStart);
        const weekNumber = getCustomWeek(weekStart);
        const weekId = `${year}-${String(weekNumber).padStart(2, '0')}`;
        
        // Navigate to weekstaat tab with the week parameter
        router.push(`/timesheets?week=${weekId}&tab=weekly`);
    };
    
    const chartData = [
      { name: 'approved', value: statusCounts.approved, fill: chartConfig.approved.color },
      { name: 'pending', value: statusCounts.pending, fill: chartConfig.pending.color },
      { name: 'concept', value: statusCounts.concept, fill: chartConfig.concept.color },
      { name: 'unfilled', value: Math.max(0, totalWorkDays - filledDays), fill: chartConfig.unfilled.color },
    ].filter(d => d.value > 0);

    // Helper component voor WeekNumber met error handling
    const WeekNumberComponent = (props: any) => {
        // react-day-picker kan verschillende prop structuren gebruiken
        // We gebruiken altijd onze custom week berekening, ongeacht welke API wordt gebruikt
        let weekNumber: number | null = null;
        let weekStartDate: Date | null = null;
        
        // Bepaal eerst de week start datum
        if (props.dates && props.dates.length > 0 && props.dates[0] instanceof Date) {
            weekStartDate = startOfWeek(props.dates[0], { weekStartsOn: 1 });
        } else if (props.date && props.date instanceof Date) {
            weekStartDate = startOfWeek(props.date, { weekStartsOn: 1 });
        }
        
        // Bereken altijd het custom weeknummer op basis van de week start datum
        if (weekStartDate) {
            weekNumber = getCustomWeek(weekStartDate);
        }
        
        if (!weekNumber || weekNumber === null || isNaN(weekNumber)) {
            return <div className="w-9 h-9 flex items-center justify-center text-xs text-muted-foreground">-</div>;
        }
        
        try {
            let status: WeeklyLogStatus | undefined;
            if (weekStartDate) {
                const weekYear = getCustomWeekYear(weekStartDate);
                const weekId = `${weekYear}-${weekNumber}`;
                status = weekStatusMap.get(weekId);
            }
            
            let colorClass = '';
            if (status === 'approved') {
                colorClass = 'bg-green-600/20 text-green-900 font-bold border-green-600 border-2';
            } else if (status === 'pending') {
                colorClass = 'bg-orange-500/20 text-orange-800 font-semibold border-orange-500 border-2';
            } else if (status === 'concept') {
                colorClass = 'bg-primary/20 text-primary font-semibold border-primary border-2';
            }
            
            return (
                <div className={cn(
                    'text-foreground font-medium rounded-md w-9 h-9 flex items-center justify-center cursor-pointer hover:bg-accent text-xs',
                    colorClass
                )}>
                    {String(weekNumber)}
                </div>
            );
        } catch (error) {
            console.error('Error rendering week number:', error, props);
            return <div className="w-9 h-9 flex items-center justify-center text-xs text-muted-foreground">-</div>;
        }
    };

    return (
         <Card className="overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-12">
                <div className="md:col-span-8 p-6 flex flex-col">
                    <div className="flex flex-col items-center mb-4">
                        <h2 className="text-xl font-bold mb-4">Maandoverzicht</h2>
                        <div className="flex items-center gap-4">
                            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="font-medium text-sm min-w-[140px] text-center">
                                {format(currentMonth, 'MMMM yyyy', { locale: nl })}
                            </span>
                            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                    
                    {/* 3-maanden view op desktop, 1 maand op mobiel - gecentreerd op mobiel */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative justify-items-center md:justify-items-start">
                        {/* Vorige maand - 50% doorzichtigheid, verborgen op mobiel */}
                        <div className="hidden md:block opacity-50 pointer-events-none">
                            <Calendar
                                month={prevMonth}
                                locale={nl}
                                showWeekNumber
                                modifiers={prevModifiers}
                                modifiersClassNames={{
                                    approved: 'bg-green-600/20 text-green-900 dark:text-green-300 font-bold',
                                    pending: 'bg-orange-500/20 text-orange-800 dark:text-orange-300',
                                    concept: 'bg-primary/20 text-primary',
                                    leave: 'bg-purple-500/20 text-purple-800 dark:text-purple-300 border-2 border-purple-500',
                                }}
                                className="w-full"
                                classNames={{
                                    caption: 'hidden',
                                    nav: 'hidden',
                                }}
                                components={{
                                    WeekNumber: WeekNumberComponent,
                                }}
                                formatWeekNumber={(weekNumber, date) => {
                                    // Fallback formatter voor als component niet werkt
                                    if (date) {
                                        const weekStart = startOfWeek(date, { weekStartsOn: 1 });
                                        return String(getCustomWeek(weekStart));
                                    }
                                    return String(weekNumber);
                                }}
                            />
                        </div>
                        
                        {/* Huidige maand - volledig zichtbaar */}
                        <div className="relative z-10">
                            <Calendar
                                month={currentMonth}
                                locale={nl}
                                showWeekNumber
                                modifiers={currentModifiers}
                                modifiersClassNames={{
                                    approved: 'bg-green-600/20 text-green-900 dark:text-green-300 font-bold',
                                    pending: 'bg-orange-500/20 text-orange-800 dark:text-orange-300',
                                    concept: 'bg-primary/20 text-primary',
                                    leave: 'bg-purple-500/20 text-purple-800 dark:text-purple-300 border-2 border-purple-500',
                                    selected: 'bg-primary text-primary-foreground',
                                    today: 'bg-accent text-accent-foreground',
                                }}
                                className="w-full"
                                classNames={{
                                    caption: 'hidden',
                                    nav: 'hidden',
                                }}
                                onSelect={handleDaySelect}
                                mode="single"
                                components={{
                                    WeekNumber: WeekNumberComponent,
                                }}
                                formatWeekNumber={(weekNumber, date) => {
                                    // Fallback formatter voor als component niet werkt
                                    if (date) {
                                        const weekStart = startOfWeek(date, { weekStartsOn: 1 });
                                        return String(getCustomWeek(weekStart));
                                    }
                                    return String(weekNumber);
                                }}
                            />
                        </div>
                        
                        {/* Volgende maand - 50% doorzichtigheid, verborgen op mobiel */}
                        <div className="hidden md:block opacity-50 pointer-events-none">
                            <Calendar
                                month={nextMonth}
                                locale={nl}
                                showWeekNumber
                                modifiers={nextModifiers}
                                modifiersClassNames={{
                                    approved: 'bg-green-600/20 text-green-900 dark:text-green-300 font-bold',
                                    pending: 'bg-orange-500/20 text-orange-800 dark:text-orange-300',
                                    concept: 'bg-primary/20 text-primary',
                                    leave: 'bg-purple-500/20 text-purple-800 dark:text-purple-300 border-2 border-purple-500',
                                }}
                                className="w-full"
                                classNames={{
                                    caption: 'hidden',
                                    nav: 'hidden',
                                }}
                                components={{
                                    WeekNumber: WeekNumberComponent,
                                }}
                                formatWeekNumber={(weekNumber, date) => {
                                    // Fallback formatter voor als component niet werkt
                                    if (date) {
                                        const weekStart = startOfWeek(date, { weekStartsOn: 1 });
                                        return String(getCustomWeek(weekStart));
                                    }
                                    return String(weekNumber);
                                }}
                            />
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t">
                        <LegendItem icon={CheckCircle} text="Goedgekeurd" colorClass="text-green-600" />
                        <LegendItem icon={Clock} text="In behandeling" colorClass="text-orange-500" />
                        <LegendItem icon={Circle} text="Ingevuld (Concept)" colorClass="text-primary" />
                        <LegendItem icon={CalendarIcon} text="Goedgekeurd verlof" colorClass="text-purple-600" />
                    </div>
                </div>
                <div className="md:col-span-4 bg-muted/30 p-6 border-l flex flex-col items-center justify-center">
                    <h2 className="text-xl font-bold mb-4 text-center">Maandvoortgang</h2>
                    {logsLoading ? (
                        <Skeleton className="h-[200px] w-[200px] rounded-full" />
                    ) : (
                    <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[200px]">
                        <PieChart>
                            <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
                             <Pie
                                data={chartData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={60}
                                strokeWidth={5}
                                >
                                {chartData.map((entry) => (
                                    <Cell key={entry.name} fill={entry.fill} className="stroke-background" />
                                ))}
                            </Pie>
                        </PieChart>
                    </ChartContainer>
                    )}
                    <div className="text-center mt-4">
                        <p className="text-3xl font-bold text-primary">{Math.round(filledPercentage)}%</p>
                        <p className="text-sm text-muted-foreground">{filledDays} van de {totalWorkDays} werkdagen ingediend</p>
                    </div>
                </div>
            </div>
        </Card>
    );
}
