
"use client";

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAdminData } from '@/hooks/use-admin-data';
import { useToast } from '@/hooks/use-toast';
import type { User, WeeklyLog, DailyLog, DayStatus, Customer, LeaveRequest, Fine } from '@/lib/types';
import { getYear, getMonth, format, getDay, isSameDay, parseISO, isWithinInterval, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, startOfWeek, addDays } from 'date-fns';
import { getCustomWeek, getCustomWeekYear } from '@/lib/utils';
import { nl } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Download, User as UserIcon, Calendar as CalendarIcon, CheckCircle, Edit, Clock, X, Car } from 'lucide-react';
import { getWeekIdsForMonth, getWeekIdsForYear, getDateFromWeekId } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { holidays } from '@/lib/holidays';
import { calculateWorkHours } from '@/hooks/use-weekly-logs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import { mapSupabaseToApp } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { statusTranslations } from '@/lib/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';


// Create arrays for month and year selection
const currentYear = getYear(new Date());
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(currentYear, i), 'LLLL', { locale: nl }),
}));
const weeksPerPage = 6;

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
};

const DEFAULT_OVERNIGHT_ALLOWANCE = 32;


const StatusBadge = ({ status }: { status?: 'concept' | 'pending' | 'approved' | 'not_submitted' }) => {
    let content;
    switch (status) {
        case 'approved':
            content = <><CheckCircle className="h-3 w-3 text-green-500" /> <span className="text-green-700">Goedgekeurd</span></>;
            break;
        case 'pending':
            content = <><Clock className="h-3 w-3 text-orange-500" /> <span className="text-orange-700">In behandeling</span></>;
            break;
        case 'concept':
            content = <><Edit className="h-3 w-3 text-blue-500" /> <span className="text-blue-700">Concept</span></>;
            break;
        default:
             content = <><X className="h-3 w-3 text-muted-foreground" /> <span className="text-muted-foreground">Niet ingediend</span></>;
    }
    return <div className="flex items-center justify-center gap-1 font-normal text-xs">{content}</div>;
};


const WeekDetailsTable = ({ weekId, users, logs, customers, driverFines, leaveRequests }: { weekId: string, users: User[], logs: WeeklyLog[], customers: Customer[], driverFines: Fine[], leaveRequests: LeaveRequest[]}) => {
    
    const weeklyReport = useMemo(() => {
        const report: Record<string, any> = {};

        users.forEach(user => {
            const log = logs.find(l => l.userId === user.uid && l.weekId === weekId);
            const daysData: Record<string, number> = {
                maandag: 0, dinsdag: 0, woensdag: 0, donderdag: 0, vrijdag: 0, zaterdag: 0, zondag: 0,
            };
            let weekdayHours = 0;
            let saturdayHours = 0;
            let sundayHolidayHours = 0;
            let surchargeHours = 0;
            let workedDays = 0;
            let overnightStays = 0;
            let expenseAllowance = 0;

            if (log) {
                 log.days.forEach(day => {
                    const dayName = day.day.toLowerCase();
                    const dayOfWeek = getDay(parseISO(day.date));
                    const isHoliday = holidays.some(h => isSameDay(h.date, parseISO(day.date)));
                    const dayDate = parseISO(day.date);
                    
                    // Check for approved leave request for this day
                    const userLeave = leaveRequests.find(l => 
                        l.userId === user.uid && 
                        isWithinInterval(dayDate, { start: parseISO(l.startDate), end: parseISO(l.endDate) })
                    );
                    
                    // Determine actual status: leave request takes priority (except for sickness)
                    let actualStatus: DayStatus = day.status;
                    if (userLeave && day.status !== 'ziek') {
                        // Approved leave overrides the log status (except sickness)
                        actualStatus = userLeave.type === 'vakantie' ? 'vrij' : userLeave.type as DayStatus;
                    }
                    
                    let workHours = 0;
                    if(actualStatus === 'gewerkt') {
                        workedDays++;
                        if (day.overnightStay) overnightStays++;

                        const customer = customers.find(c => day.licensePlate && c.assignedLicensePlates?.includes(day.licensePlate));
                        if(customer) {
                            expenseAllowance += customer.dailyExpenseAllowance ?? 0;
                        }

                        workHours = calculateWorkHours(day);

                        const getOverlapMinutes = (start1: number, end1: number, start2: number, end2: number) => Math.max(0, Math.min(end1, end2) - Math.max(start1, start2));
                        const startTimeInMinutes = (day.startTime?.hour || 0) * 60 + (day.startTime?.minute || 0);
                        const endTimeInMinutes = (day.endTime?.hour || 0) * 60 + (day.endTime?.minute || 0);
                        if (endTimeInMinutes > startTimeInMinutes) {
                            const surchargeMinutes = getOverlapMinutes(startTimeInMinutes, endTimeInMinutes, 0, 5 * 60) + getOverlapMinutes(startTimeInMinutes, endTimeInMinutes, 21 * 60, 24 * 60);
                            surchargeHours += surchargeMinutes / 60;
                        }
                    } else if (['ziek', 'vrij', 'atv', 'ouderschapsverlof', 'cursus', 'feestdag', 'persoonlijk', 'onbetaald'].includes(actualStatus)) {
                        // Alle deze statussen tellen als 8 uur, behalve weekend
                        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                            workHours = 8;
                        }
                    }
                    daysData[dayName] = workHours;

                    // Bepaal waar de uren bij horen: zondag/feestdag gewerkt = 200%, zaterdag = 150%, weekdagen = 100%/130%
                    if (actualStatus === 'gewerkt' && (isHoliday || dayOfWeek === 0)) {
                        // Gewerkt op zondag of feestdag = altijd 200%
                        sundayHolidayHours += workHours;
                    } else if (actualStatus === 'gewerkt' && dayOfWeek === 6) {
                        // Gewerkt op zaterdag = altijd 150%
                        saturdayHours += workHours;
                    } else if (actualStatus === 'gewerkt') {
                        // Gewerkt op weekdag
                        weekdayHours += workHours;
                    } else if (['ziek', 'vrij', 'atv', 'ouderschapsverlof', 'cursus', 'feestdag', 'persoonlijk', 'onbetaald'].includes(actualStatus)) {
                        // Deze statussen tellen als 8 uur voor salarisadministratie
                        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                            weekdayHours += 8;
                        }
                    }
                });
            }

            // Bereken 100% en 130% uren: eerste 40 uren zijn 100%, daarboven 130%
            // Maar zaterdag blijft 150% en zondag/feestdag gewerkt blijft 200%
            const totalWeekdayHours = weekdayHours;
            let hours100 = 0;
            let hours130 = 0;
            if (totalWeekdayHours > 40) {
                hours100 = 40;
                hours130 = totalWeekdayHours - 40;
            } else {
                hours100 = totalWeekdayHours;
            }

            const travelDays = workedDays - overnightStays;
            const travelDistance = user.hasTravelAllowance ? travelDays * (user.travelDistance ?? 0) * 2 : 0;
            const travelAllowance = user.hasTravelAllowance ? travelDistance * (user.travelAllowanceRate ?? 0) : 0;

            const overnightRate = user.overnightAllowanceRate ?? DEFAULT_OVERNIGHT_ALLOWANCE;
            const totalExpenseAllowance = expenseAllowance + (overnightStays * overnightRate);
            
            // Calculate fines for this week
            const fineDate = getDateFromWeekId(weekId);
            let fineDeduction = 0;
            if (fineDate) {
                const fineWeekStart = startOfWeek(fineDate, { weekStartsOn: 1 });
                const fineYear = getCustomWeekYear(fineWeekStart);
                const fineWeekNumber = getCustomWeek(fineWeekStart);
                const fineWeekId = `${fineYear}-${fineWeekNumber}`;
                
                const weekFines = driverFines.filter(f => {
                    if (!f.userId || f.userId !== user.uid) return false;
                    try {
                        const fineDateParsed = parseISO(f.date);
                        const fWeekStart = startOfWeek(fineDateParsed, { weekStartsOn: 1 });
                        const fYear = getCustomWeekYear(fWeekStart);
                        const fWeekNumber = getCustomWeek(fWeekStart);
                        const fWeekId = `${fYear}-${fWeekNumber}`;
                        return fWeekId === fineWeekId;
                    } catch (e) {
                        return false;
                    }
                });
                
                fineDeduction = weekFines.reduce((sum, fine) => sum + fine.amount, 0);
            }

            report[user.uid!] = {
                ...daysData,
                totalHours: weekdayHours + saturdayHours + sundayHolidayHours,
                hours100, hours130,
                hours150: saturdayHours,
                hours200: sundayHolidayHours,
                surchargeHours19: surchargeHours,
                travelAllowance,
                totalExpenseAllowance,
                fineDeduction: fineDeduction > 0 ? -fineDeduction : 0,
            };
        });

        return report;
    }, [weekId, users, logs, customers, driverFines, leaveRequests]);

    const dayRows = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
    const summaryRows = [
        { key: 'totalHours', label: 'Totaal Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'hours100', label: '100% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'hours130', label: '130% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'hours150', label: '150% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'hours200', label: '200% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'surchargeHours19', label: '19% Toeslaguren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'travelAllowance', label: 'Reiskostenvergoeding', format: (val: number) => val > 0 ? formatCurrency(val) : '-' },
        { key: 'totalExpenseAllowance', label: 'Onkostenvergoeding', format: (val: number) => val > 0 ? formatCurrency(val) : '-' },
        { key: 'fineDeduction', label: 'Inhouding Boete', format: (val: number) => val !== 0 ? formatCurrency(val) : '-' },
    ];
    
    const showRow = (key: string) => {
        if (key.includes('Allowance') || key === 'fineDeduction') {
            return users.some(u => weeklyReport[u.uid!]?.[key] !== 0);
        }
        return true;
    }

    return (
        <div className="overflow-x-auto p-4 border-t">
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[150px] font-bold">Gegeven</TableHead>
                        {users.map(user => {
                             const log = logs.find(l => l.userId === user.uid && l.weekId === weekId);
                             return (
                                <TableHead key={user.uid} className="text-center">
                                    <div className="font-semibold">{user.firstName}</div>
                                    <StatusBadge status={log?.status ?? 'not_submitted'} />
                                </TableHead>
                            )
                        })}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {dayRows.map(day => (
                        <TableRow key={day}>
                            <TableCell className="font-medium capitalize">{day}</TableCell>
                            {users.map(user => (
                                <TableCell key={user.uid} className="text-center">
                                    {weeklyReport[user.uid!]?.[day] > 0 ? weeklyReport[user.uid!][day].toFixed(2) : '-'}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                    {summaryRows.map(row => {
                         if (!showRow(row.key)) return null;
                         return (
                            <TableRow key={row.key} className="bg-muted/50 font-bold">
                                <TableCell>{row.label}</TableCell>
                                {users.map(user => (
                                    <TableCell key={user.uid} className="text-center">
                                        {weeklyReport[user.uid!]?.[row.key] !== undefined && weeklyReport[user.uid!][row.key] !== 0 ? row.format(weeklyReport[user.uid!][row.key]) : '-'}
                                    </TableCell>
                                ))}
                            </TableRow>
                         )
                    })}
                </TableBody>
            </Table>
        </div>
    );
};


const MonthlyTotalTable = ({ users, logs, customers, weeks, leaveRequests, driverFines }: { users: User[], logs: WeeklyLog[], customers: Customer[], weeks: string[], leaveRequests: LeaveRequest[], driverFines: Fine[] }) => {
    const monthlyTotals = useMemo(() => {
        const report: Record<string, any> = {};

        users.forEach(user => {
            report[user.uid!] = {
                hours100: 0,
                hours130: 0,
                hours150: 0,
                hours200: 0,
                surchargeHours19: 0,
                travelAllowance: 0,
                totalExpenseAllowance: 0,
                workedDays: 0,
                sickDays: 0,
                vacationDays: 0,
                atvDays: 0,
                holidayDays: 0,
                fineDeduction: 0,
            };
        });
        
        const monthStartDate = startOfMonth(new Date(parseInt(weeks[0].split('-')[0], 10), getMonth(new Date()), 1));
        const monthEndDate = endOfMonth(monthStartDate);
        const daysInMonth = eachDayOfInterval({start: monthStartDate, end: monthEndDate});

        daysInMonth.forEach(day => {
            const dayOfWeek = getDay(day);
            const isHoliday = holidays.some(h => isSameDay(h.date, day));
            if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) return;

            const weekId = `${getCustomWeekYear(day)}-${getCustomWeek(day)}`;

            users.forEach(user => {
                const log = logs.find(l => l.userId === user.uid && l.weekId === weekId);
                const dayLog = log?.days.find(d => isSameDay(parseISO(d.date), day));
                const userLeave = leaveRequests.find(l => l.userId === user.uid && isWithinInterval(day, { start: parseISO(l.startDate), end: parseISO(l.endDate) }));

                let status: DayStatus = dayLog?.status || 'onbetaald';
                if(userLeave && status !== 'ziek') { // Sickness overrides leave
                    status = userLeave.type === 'vakantie' ? 'vrij' : userLeave.type as DayStatus;
                }

                if (status === 'gewerkt') report[user.uid!].workedDays++;
                else if (status === 'ziek') report[user.uid!].sickDays++;
                else if (status === 'vrij') report[user.uid!].vacationDays++;
                else if (status === 'atv') report[user.uid!].atvDays++;
                else if (status === 'feestdag') report[user.uid!].holidayDays++;
            });
        });


        weeks.forEach(weekId => {
            users.forEach(user => {
                const log = logs.find(l => l.userId === user.uid && l.weekId === weekId);
                if (log) {
                    let weekdayHours = 0;
                    let saturdayHours = 0;
                    let sundayHolidayHours = 0;
                    let surchargeHours = 0;
                    let workedDays = 0;
                    let overnightStays = 0;
                    let expenseAllowance = 0;
                    
                    log.days.forEach(day => {
                        const dayOfWeek = getDay(parseISO(day.date));
                        const isHoliday = holidays.some(h => isSameDay(h.date, parseISO(day.date)));
                        const dayDate = parseISO(day.date);
                        
                        // Check for approved leave request for this day
                        const userLeave = leaveRequests.find(l => 
                            l.userId === user.uid && 
                            isWithinInterval(dayDate, { start: parseISO(l.startDate), end: parseISO(l.endDate) })
                        );
                        
                        // Determine actual status: leave request takes priority (except for sickness)
                        let actualStatus: DayStatus = day.status;
                        if (userLeave && day.status !== 'ziek') {
                            // Approved leave overrides the log status (except sickness)
                            actualStatus = userLeave.type === 'vakantie' ? 'vrij' : userLeave.type as DayStatus;
                        }
                        
                        let workHours = 0;
                        if(actualStatus === 'gewerkt') {
                            workedDays++;
                            if (day.overnightStay) overnightStays++;

                             const customer = customers.find(c => day.licensePlate && c.assignedLicensePlates?.includes(day.licensePlate));
                             if(customer) {
                                expenseAllowance += customer.dailyExpenseAllowance ?? 0;
                             }

                            workHours = calculateWorkHours(day);
                            
                             const getOverlapMinutes = (start1: number, end1: number, start2: number, end2: number) => Math.max(0, Math.min(end1, end2) - Math.max(start1, start2));
                             const startTimeInMinutes = (day.startTime?.hour || 0) * 60 + (day.startTime?.minute || 0);
                             const endTimeInMinutes = (day.endTime?.hour || 0) * 60 + (day.endTime?.minute || 0);
                             if (endTimeInMinutes > startTimeInMinutes) {
                                const surchargeMinutes = getOverlapMinutes(startTimeInMinutes, endTimeInMinutes, 0, 5 * 60) + getOverlapMinutes(startTimeInMinutes, endTimeInMinutes, 21 * 60, 24 * 60);
                                surchargeHours += surchargeMinutes / 60;
                             }

                        } else if (['ziek', 'vrij', 'atv', 'ouderschapsverlof', 'cursus', 'feestdag', 'persoonlijk', 'onbetaald'].includes(actualStatus)) {
                            // Alle deze statussen tellen als 8 uur, behalve weekend
                            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                                workHours = 8;
                            }
                        }
                        
                        // Bepaal waar de uren bij horen: zondag/feestdag gewerkt = 200%, zaterdag = 150%, weekdagen = 100%/130%
                        if (actualStatus === 'gewerkt' && (isHoliday || dayOfWeek === 0)) {
                            // Gewerkt op zondag of feestdag = altijd 200%
                            sundayHolidayHours += workHours;
                        } else if (actualStatus === 'gewerkt' && dayOfWeek === 6) {
                            // Gewerkt op zaterdag = altijd 150%
                            saturdayHours += workHours;
                        } else if (actualStatus === 'gewerkt') {
                            // Gewerkt op weekdag
                            weekdayHours += workHours;
                        } else if (['ziek', 'vrij', 'atv', 'ouderschapsverlof', 'cursus', 'feestdag', 'persoonlijk', 'onbetaald'].includes(actualStatus)) {
                            // Deze statussen tellen als 8 uur voor salarisadministratie
                            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                                weekdayHours += 8;
                            }
                        }
                    });
                    
                    let hours100 = 0;
                    let hours130 = 0;
                    if (weekdayHours > 40) {
                        hours100 = 40;
                        hours130 = weekdayHours - 40;
                    } else {
                        hours100 = weekdayHours;
                    }
                    
                    report[user.uid!].hours100 += hours100;
                    report[user.uid!].hours130 += hours130;
                    report[user.uid!].hours150 += saturdayHours;
                    report[user.uid!].hours200 += sundayHolidayHours;
                    report[user.uid!].surchargeHours19 += surchargeHours;
                    
                    const travelDays = workedDays - overnightStays;
                    const travelDistance = user.hasTravelAllowance ? travelDays * (user.travelDistance ?? 0) * 2 : 0;
                    const travelAllowance = user.hasTravelAllowance ? travelDistance * (user.travelAllowanceRate ?? 0) : 0;
                    const overnightRate = user.overnightAllowanceRate ?? DEFAULT_OVERNIGHT_ALLOWANCE;
                    const totalExpenseAllowance = expenseAllowance + (overnightStays * overnightRate);

                    report[user.uid!].travelAllowance += travelAllowance;
                    report[user.uid!].totalExpenseAllowance += totalExpenseAllowance;
                }
                
                // Calculate fines for this week
                const fineDate = getDateFromWeekId(weekId);
                if (fineDate) {
                    const fineWeekStart = startOfWeek(fineDate, { weekStartsOn: 1 });
                    const fineYear = getCustomWeekYear(fineWeekStart);
                    const fineWeekNumber = getCustomWeek(fineWeekStart);
                    const fineWeekId = `${fineYear}-${fineWeekNumber}`;
                    
                    const weekFines = driverFines.filter(f => {
                        if (!f.userId || f.userId !== user.uid) return false;
                        try {
                            const fineDateParsed = parseISO(f.date);
                            const fWeekStart = startOfWeek(fineDateParsed, { weekStartsOn: 1 });
                            const fYear = getCustomWeekYear(fWeekStart);
                            const fWeekNumber = getCustomWeek(fWeekStart);
                            const fWeekId = `${fYear}-${fWeekNumber}`;
                            return fWeekId === fineWeekId;
                        } catch (e) {
                            return false;
                        }
                    });
                    
                    const totalFineAmount = weekFines.reduce((sum, fine) => sum + fine.amount, 0);
                    if (totalFineAmount > 0) {
                        report[user.uid!].fineDeduction += -totalFineAmount;
                    }
                }
            });
        });
        return report;
    }, [users, logs, customers, weeks, leaveRequests, driverFines]);
    
    const summaryRows = [
        { key: 'workedDays', label: 'Werkdagen', format: (val: number) => val > 0 ? val : '-' },
        { key: 'sickDays', label: 'Ziektedagen', format: (val: number) => val > 0 ? val : '-' },
        { key: 'vacationDays', label: 'Vakantiedagen', format: (val: number) => val > 0 ? val : '-' },
        { key: 'atvDays', label: 'ATV-dagen', format: (val: number) => val > 0 ? val : '-' },
        { key: 'hours100', label: '100% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'hours130', label: '130% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'hours150', label: '150% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'hours200', label: '200% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'surchargeHours19', label: '19% Toeslaguren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'travelAllowance', label: 'Reiskostenvergoeding', format: (val: number) => val > 0 ? formatCurrency(val) : '-' },
        { key: 'totalExpenseAllowance', label: 'Onkostenvergoeding', format: (val: number) => val > 0 ? formatCurrency(val) : '-' },
        { key: 'fineDeduction', label: 'Inhouding Boete', format: (val: number) => val !== 0 ? formatCurrency(val) : '-' },
    ];
    
     const showRow = (key: string) => {
        if (key.includes('Allowance') || key === 'fineDeduction') {
            return users.some(u => monthlyTotals[u.uid!]?.[key] !== 0);
        }
        return true;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Maandtotaal</CardTitle>
            </CardHeader>
             <CardContent className="p-0">
                 <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[180px] font-bold">Gegeven</TableHead>
                                {users.map(user => (
                                    <TableHead key={user.uid} className="text-center">{user.firstName}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {summaryRows.map(row => {
                                if (!showRow(row.key)) return null;
                                return (
                                <TableRow key={row.key} className="font-bold">
                                    <TableCell className="font-medium">{row.label}</TableCell>
                                    {users.map(user => (
                                        <TableCell key={user.uid} className="text-center">
                                            {monthlyTotals[user.uid!]?.[row.key] !== undefined && monthlyTotals[user.uid!][row.key] !== 0 ? row.format(monthlyTotals[user.uid!][row.key]) : '-'}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            )})}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}

export default function PayrollPage() {
    const [selectedMonth, setSelectedMonth] = useState(getMonth(new Date()));
    const [selectedYear, setSelectedYear] = useState(getYear(new Date()));
    const { users: allUsers, logs: allLogs, loading } = useAdminData();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [driverFines, setDriverFines] = useState<Fine[]>([]);
    const [isLoadingExtras, setIsLoadingExtras] = useState(true);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [selectedWeeks, setSelectedWeeks] = useState<Set<string>>(new Set());
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
    const [exportWeekStart, setExportWeekStart] = useState(0);
    const { toast } = useToast();

    useEffect(() => {
        setIsLoadingExtras(true);
        let active = true;
        const fetchExtras = async () => {
            const [{ data: custRows, error: custErr }, { data: leaveRows, error: leaveErr }, { data: finesRows, error: finesErr }] = await Promise.all([
                supabase.from('customers').select('*'),
                supabase.from('leave_requests').select('*').eq('status', 'approved'),
                supabase.from('fines').select('*').eq('paid_by', 'driver').not('user_id', 'is', null)
            ]);
            if (!active) return;
            if (!custErr) setCustomers(((custRows || []).map(r => mapSupabaseToApp<Customer>(r))));
            if (!leaveErr) setLeaveRequests(((leaveRows || []).map(r => mapSupabaseToApp<LeaveRequest>(r))));
            
            // Map fines to Fine type
            const mappedFines = (finesRows || []).map((r: any) => ({
                id: r.id,
                userId: r.user_id || '',
                userFirstName: '',
                userLastName: '',
                date: r.date ? new Date(r.date).toISOString() : new Date().toISOString(),
                amount: Number(r.amount) || 0,
                reason: r.reason || '',
                paidBy: r.paid_by || 'driver',
                receiptUrl: undefined,
                licensePlate: r.license_plate || undefined,
                createdAt: r.created_at || new Date().toISOString(),
            } as Fine));
            
            // Fill user names
            const userMap = new Map(allUsers.map(u => [u.uid, { firstName: u.firstName, lastName: u.lastName }]));
            const finesWithNames = mappedFines.map(f => ({
                ...f,
                userFirstName: userMap.get(f.userId)?.firstName || '',
                userLastName: userMap.get(f.userId)?.lastName || '',
            }));
            
            setDriverFines(finesWithNames);
            setIsLoadingExtras(false);
        };
        fetchExtras();
        const ch1 = supabase.channel('payroll-customers').on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchExtras).subscribe();
        const ch2 = supabase.channel('payroll-leave').on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, fetchExtras).subscribe();
        const ch3 = supabase.channel('payroll-fines').on('postgres_changes', { event: '*', schema: 'public', table: 'fines' }, fetchExtras).subscribe();
        return () => { active = false; ch1.unsubscribe(); ch2.unsubscribe(); ch3.unsubscribe(); };
    }, [allUsers]);

    const selectedDate = new Date(selectedYear, selectedMonth);
    const weekIdsInMonth = getWeekIdsForMonth(selectedDate);
    const weekIdsInYear = useMemo(() => getWeekIdsForYear(new Date(selectedYear, 0, 1)), [selectedYear]);
    const maxExportStart = Math.max(0, weekIdsInYear.length - weeksPerPage);
    const visibleExportWeeks = useMemo(() => weekIdsInYear.slice(exportWeekStart, exportWeekStart + weeksPerPage), [weekIdsInYear, exportWeekStart]);

    const approvedLogsInMonth = useMemo(() => {
        return allLogs.filter(log => log.status === 'approved' && weekIdsInMonth.includes(log.weekId));
    }, [allLogs, weekIdsInMonth]);
    const approvedLogsInYear = useMemo(() => {
        return allLogs.filter(log => log.status === 'approved' && weekIdsInYear.includes(log.weekId));
    }, [allLogs, weekIdsInYear]);
    
    const usersWithLogs = useMemo(() => {
        // Show all active users (not admin), not just those with approved logs
        // This allows admins to see all employees even if they don't have logs for the selected month
        return allUsers.filter(u => u.role !== 'admin' && u.status === 'active');
    }, [allUsers]);

    useEffect(() => {
        setExportWeekStart(prev => Math.min(prev, maxExportStart));
    }, [maxExportStart]);

    useEffect(() => {
        setSelectedWeeks(new Set());
        setSelectedUsers(new Set());
        setExportWeekStart(0);
    }, [selectedYear]);

    // Initialize selections when dialog opens
    const handleOpenExportDialog = () => {
        // Start with empty selections (all unchecked)
        setSelectedWeeks(new Set());
        setSelectedUsers(new Set());
        const monthWeekIndex = weekIdsInYear.findIndex(weekId => {
            const date = getDateFromWeekId(weekId);
            return date && getMonth(date) === selectedMonth;
        });
        const halfWindow = Math.floor(weeksPerPage / 2);
        const startIndex = monthWeekIndex === -1
            ? Math.max(0, weekIdsInYear.length - weeksPerPage)
            : Math.min(Math.max(monthWeekIndex - halfWindow, 0), maxExportStart);
        setExportWeekStart(startIndex);
        setIsExportDialogOpen(true);
    };

    const handleExport = () => {
        if (loading || isLoadingExtras) {
            toast({ title: "Even geduld", description: "De gegevens worden nog geladen." });
            return;
        }

        if (selectedWeeks.size === 0 || selectedUsers.size === 0) {
            toast({ 
                variant: "destructive",
                title: "Selectie vereist", 
                description: "Selecteer minimaal een week en een medewerker." 
            });
            return;
        }

        const selectedUsersArray = usersWithLogs.filter(u => selectedUsers.has(u.uid!));
        const selectedWeeksArray = Array.from(selectedWeeks).sort((a, b) => {
            const aDate = getDateFromWeekId(a)?.getTime() ?? 0;
            const bDate = getDateFromWeekId(b)?.getTime() ?? 0;
            return aDate - bDate;
        });

        const wb = XLSX.utils.book_new();
        
        // Per medewerker een tabblad met per week de gemaakte uren
        selectedUsersArray.forEach(user => {
            // Include all selected weeks, not just those with approved logs
            // This ensures fines are shown even if there's no log for that week
            const userWeeks = selectedWeeksArray;
            
            if (userWeeks.length === 0) return;

            const weekHeaders = ['Gegeven', ...userWeeks.map(w => `Week ${w.split('-')[1]}`), 'Totaal'];
            const userSheetData: (string | number)[][] = [weekHeaders];
            
            const userReport: Record<string, any> = {};
            const userTotals: Record<string, number> = { 
                workedDays: 0, sickDays: 0, vacationDays: 0, atvDays: 0, holidayDays: 0,
                hours100: 0, hours130: 0, hours150: 0, hours200: 0, 
                surchargeHours19: 0, travelAllowance: 0, totalExpenseAllowance: 0,
                totalHours: 0, fineDeduction: 0
            };
            
            userWeeks.forEach(weekId => {
                const log = approvedLogsInYear.find(l => l.userId === user.uid && l.weekId === weekId);
                const weekReport: Record<string, any> = { 
                    workedDays: 0, sickDays: 0, vacationDays: 0, atvDays: 0, holidayDays: 0,
                    hours100: 0, hours130: 0, hours150: 0, hours200: 0, 
                    surchargeHours19: 0, travelAllowance: 0, totalExpenseAllowance: 0,
                    totalHours: 0, fineDeduction: 0
                };
                
                // Calculate fines for this week
                const fineDate = getDateFromWeekId(weekId);
                if (fineDate) {
                    const weekFines = driverFines.filter(f => {
                        if (!f.userId || f.userId !== user.uid) return false;
                        try {
                            const fineDateParsed = parseISO(f.date);
                            // Calculate the weekId from the fine date
                            const fineWeekStart = startOfWeek(fineDateParsed, { weekStartsOn: 1 });
                            const fineYear = getCustomWeekYear(fineWeekStart);
                            const fineWeekNumber = getCustomWeek(fineWeekStart);
                            const fineWeekId = `${fineYear}-${fineWeekNumber}`;
                            
                            // Compare weekIds directly instead of date ranges
                            const matches = fineWeekId === weekId;
                            
                            return matches;
                        } catch (e) {
                            console.error('Error parsing fine date:', f.date, e);
                            return false;
                        }
                    });
                    
                    const totalFineAmount = weekFines.reduce((sum, fine) => sum + fine.amount, 0);
                    weekReport.fineDeduction = totalFineAmount > 0 ? -totalFineAmount : 0;
                }
                
                // Always add fines, even if there's no log for this week
                // (fines are already calculated above)
                
                if (log) {
                    let weekdayHours = 0, saturdayHours = 0, sundayHolidayHours = 0, surchargeHours = 0, workedDays = 0, overnightStays = 0, expenseAllowance = 0;
                    
                    log.days.forEach(day => {
                        const dayOfWeek = getDay(parseISO(day.date));
                        const isHoliday = holidays.some(h => isSameDay(h.date, parseISO(day.date)));
                        const dayDate = parseISO(day.date);
                        
                        // Check for approved leave request for this day
                        const userLeave = leaveRequests.find(l => 
                            l.userId === user.uid && 
                            isWithinInterval(dayDate, { start: parseISO(l.startDate), end: parseISO(l.endDate) })
                        );
                        
                        // Determine actual status: leave request takes priority (except for sickness)
                        let actualStatus: DayStatus = day.status;
                        if (userLeave && day.status !== 'ziek') {
                            // Approved leave overrides the log status (except sickness)
                            actualStatus = userLeave.type === 'vakantie' ? 'vrij' : userLeave.type as DayStatus;
                        }
                        
                        let workHours = 0;
                        
                        if (actualStatus === 'gewerkt') {
                            weekReport.workedDays++;
                            workedDays++;
                            if (day.overnightStay) overnightStays++;
                            const customer = customers.find(c => day.licensePlate && c.assignedLicensePlates?.includes(day.licensePlate));
                            if(customer) expenseAllowance += customer.dailyExpenseAllowance ?? 0;
                            workHours = calculateWorkHours(day);
                            const getOverlapMinutes = (start1: number, end1: number, start2: number, end2: number) => Math.max(0, Math.min(end1, end2) - Math.max(start1, start2));
                            const startTimeInMinutes = (day.startTime?.hour || 0) * 60 + (day.startTime?.minute || 0);
                            const endTimeInMinutes = (day.endTime?.hour || 0) * 60 + (day.endTime?.minute || 0);
                            if (endTimeInMinutes > startTimeInMinutes) {
                                const surchargeMinutes = getOverlapMinutes(startTimeInMinutes, endTimeInMinutes, 0, 5 * 60) + getOverlapMinutes(startTimeInMinutes, endTimeInMinutes, 21 * 60, 24 * 60);
                                surchargeHours += surchargeMinutes / 60;
                            }
                        } else {
                            if (actualStatus === 'ziek') weekReport.sickDays++;
                            else if (actualStatus === 'vrij') weekReport.vacationDays++;
                            else if (actualStatus === 'atv') weekReport.atvDays++;
                            else if (actualStatus === 'feestdag') weekReport.holidayDays++;
                            if (['ziek', 'vrij', 'atv', 'ouderschapsverlof', 'cursus', 'feestdag', 'persoonlijk', 'onbetaald'].includes(actualStatus)) {
                                // Alle deze statussen tellen als 8 uur, behalve weekend
                                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                                    workHours = 8;
                                }
                            }
                        }
                        
                        // Bepaal waar de uren bij horen: zondag/feestdag gewerkt = 200%, zaterdag = 150%, weekdagen = 100%/130%
                        if (actualStatus === 'gewerkt' && (isHoliday || dayOfWeek === 0)) {
                            // Gewerkt op zondag of feestdag = altijd 200%
                            sundayHolidayHours += workHours;
                        } else if (actualStatus === 'gewerkt' && dayOfWeek === 6) {
                            // Gewerkt op zaterdag = altijd 150%
                            saturdayHours += workHours;
                        } else if (actualStatus === 'gewerkt') {
                            // Gewerkt op weekdag
                            weekdayHours += workHours;
                        } else if (['ziek', 'vrij', 'atv', 'ouderschapsverlof', 'cursus', 'feestdag', 'persoonlijk', 'onbetaald'].includes(actualStatus)) {
                            // Deze statussen tellen als 8 uur voor salarisadministratie
                            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                                weekdayHours += 8;
                            }
                        }
                    });
                    
                    if (weekdayHours > 40) {
                        weekReport.hours100 = 40;
                        weekReport.hours130 = weekdayHours - 40;
                    } else {
                        weekReport.hours100 = weekdayHours;
                    }
                    
                    weekReport.hours150 = saturdayHours;
                    weekReport.hours200 = sundayHolidayHours;
                    weekReport.surchargeHours19 = surchargeHours;
                    weekReport.totalHours = weekdayHours + saturdayHours + sundayHolidayHours;
                    
                    const travelDays = workedDays - overnightStays;
                    const travelDistance = user.hasTravelAllowance ? travelDays * (user.travelDistance ?? 0) * 2 : 0;
                    weekReport.travelAllowance = user.hasTravelAllowance ? travelDistance * (user.travelAllowanceRate ?? 0) : 0;
                    const overnightRate = user.overnightAllowanceRate ?? DEFAULT_OVERNIGHT_ALLOWANCE;
                    weekReport.totalExpenseAllowance = expenseAllowance + (overnightStays * overnightRate);
                }
                
                // Save the week report (with or without log data)
                userReport[weekId] = weekReport;
                Object.keys(userTotals).forEach(key => {
                    userTotals[key] += weekReport[key] || 0;
                });
            });
            
            const summaryRowsToExport = [
                { key: 'totalHours', label: 'Totaal Uren' },
                { key: 'workedDays', label: 'Werkdagen' },
                { key: 'sickDays', label: 'Ziektedagen' },
                { key: 'vacationDays', label: 'Vakantiedagen' },
                { key: 'atvDays', label: 'ATV-dagen' },
                { key: 'holidayDays', label: 'Feestdagen' },
                { key: 'hours100', label: '100% Uren' },
                { key: 'hours130', label: '130% Uren' },
                { key: 'hours150', label: '150% Uren' },
                { key: 'hours200', label: '200% Uren' },
                { key: 'surchargeHours19', label: '19% Toeslaguren' },
                { key: 'travelAllowance', label: 'Reiskostenvergoeding' },
                { key: 'totalExpenseAllowance', label: 'Onkostenvergoeding' },
                { key: 'fineDeduction', label: 'Inhouding Boete' }
            ];

            summaryRowsToExport.forEach(row => {
                const rowData: (string|number)[] = [row.label];
                userWeeks.forEach(weekId => {
                    const value = userReport[weekId]?.[row.key] || 0;
                    if (row.key.includes('Allowance') || row.key === 'fineDeduction') {
                        rowData.push(value !== 0 ? formatCurrency(value) : '-');
                    } else if (row.key.includes('Days')) {
                        rowData.push(value > 0 ? value : '-');
                    } else {
                        rowData.push(value > 0 ? value.toFixed(2) : '-');
                    }
                });
                const totalValue = userTotals[row.key] || 0;
                if (row.key.includes('Allowance') || row.key === 'fineDeduction') {
                    rowData.push(totalValue !== 0 ? formatCurrency(totalValue) : '-');
                } else if (row.key.includes('Days')) {
                    rowData.push(totalValue > 0 ? totalValue : '-');
                } else {
                    rowData.push(totalValue > 0 ? totalValue.toFixed(2) : '-');
                }
                userSheetData.push(rowData);
            });
            
            const userWs = XLSX.utils.aoa_to_sheet(userSheetData);
            // Limit sheet name to 31 characters (Excel limit)
            const sheetName = user.firstName.length > 27 ? user.firstName.substring(0, 27) : user.firstName;
            XLSX.utils.book_append_sheet(wb, userWs, sheetName);
        });

        const fileName = `Salaris_Export_${selectedYear}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        setIsExportDialogOpen(false);
        toast({ 
            title: "Export succesvol", 
            description: `Excel bestand gegenereerd met ${selectedUsersArray.length} ${selectedUsersArray.length === 1 ? 'medewerker' : 'medewerkers'}.` 
        });
    };

    const isLoading = loading || isLoadingExtras;
    const summaryRows = [
        { key: 'workedDays', label: 'Werkdagen', format: (val: number) => val > 0 ? val : '-' },
        { key: 'sickDays', label: 'Ziektedagen', format: (val: number) => val > 0 ? val : '-' },
        { key: 'vacationDays', label: 'Vakantiedagen', format: (val: number) => val > 0 ? val : '-' },
        { key: 'atvDays', label: 'ATV-dagen', format: (val: number) => val > 0 ? val : '-' },
        { key: 'holidayDays', label: 'Feestdagen', format: (val: number) => val > 0 ? val : '-' },
        { key: 'hours100', label: '100% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'hours130', label: '130% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'hours150', label: '150% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'hours200', label: '200% Uren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'surchargeHours19', label: '19% Toeslaguren', format: (val: number) => val > 0 ? val.toFixed(2) : '-' },
        { key: 'travelAllowance', label: 'Reiskostenvergoeding', format: (val: number) => val > 0 ? formatCurrency(val) : '-' },
        { key: 'totalExpenseAllowance', label: 'Onkostenvergoeding', format: (val: number) => val > 0 ? formatCurrency(val) : '-' },
    ];


    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Salarisadministratie</h1>
                    <p className="text-muted-foreground">Genereer een Excel-export voor de salarisadministratie op basis van goedgekeurde weekstaten.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Maand" />
                        </SelectTrigger>
                        <SelectContent>
                            {months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Jaar" />
                        </SelectTrigger>
                        <SelectContent>
                            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                    </Select>
                     <Button onClick={handleOpenExportDialog} disabled={isLoading}>
                        <Download className="mr-2 h-4 w-4" />
                        Exporteer naar Excel
                    </Button>
                </div>
            </div>

            {isLoading ? (
                 <Skeleton className="h-[400px] w-full" />
            ) : usersWithLogs.length > 0 ? (
                <Accordion type="multiple" className="w-full space-y-4">
                     <AccordionItem value="total">
                        <AccordionTrigger className="text-lg font-semibold bg-card p-4 rounded-lg">Maandtotaal Alle Medewerkers</AccordionTrigger>
                        <AccordionContent>
                           <MonthlyTotalTable users={usersWithLogs} logs={approvedLogsInMonth} customers={customers} weeks={weekIdsInMonth} leaveRequests={leaveRequests} driverFines={driverFines} />
                        </AccordionContent>
                    </AccordionItem>
                    {weekIdsInMonth.map(weekId => (
                        <AccordionItem value={weekId} key={weekId}>
                            <AccordionTrigger className="text-lg font-semibold bg-card p-4 rounded-lg">Week {weekId.split('-')[1]}</AccordionTrigger>
                            <AccordionContent>
                                <WeekDetailsTable weekId={weekId} users={usersWithLogs} logs={approvedLogsInMonth} customers={customers} driverFines={driverFines} leaveRequests={leaveRequests} />
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                 <Card>
                    <CardContent className="p-12 text-center text-muted-foreground">
                        <p>Geen goedgekeurde weekstaten gevonden voor {months[selectedMonth].label} {selectedYear}.</p>
                    </CardContent>
                </Card>
            )}

            {/* Export Dialog */}
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Exporteer naar Excel</DialogTitle>
                        <DialogDescription>
                            Selecteer de weken en medewerkers die u wilt meenemen in de export. Per medewerker wordt een apart tabblad aangemaakt met per week de gemaakte uren.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setExportWeekStart(prev => Math.max(prev - weeksPerPage, 0))}
                                    disabled={exportWeekStart === 0}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-sm font-medium">
                                    {weekIdsInYear.length > 0
                                        ? `Week ${visibleExportWeeks[0]?.split('-')[1] ?? '?'} - ${visibleExportWeeks[visibleExportWeeks.length - 1]?.split('-')[1] ?? '?'} (${selectedYear})`
                                        : `Geen weken voor ${selectedYear}`}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setExportWeekStart(prev => Math.min(prev + weeksPerPage, maxExportStart))}
                                    disabled={exportWeekStart >= maxExportStart}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                            <span className="text-xs text-muted-foreground">Blader door alle weken van dit jaar</span>
                        </div>
                        {/* Table layout: Medewerkers as rows, Weeks as columns */}
                        <div className="overflow-x-auto border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">
                                            <div className="flex items-center justify-between">
                                                <span>Medewerker</span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={() => {
                                                        const usersWithAnyLogs = usersWithLogs.filter(u => 
                                                            weekIdsInYear.some(weekId =>
                                                                approvedLogsInYear.some(log => log.userId === u.uid && log.weekId === weekId)
                                                            )
                                                        );
                                                        if (usersWithAnyLogs.length === 0) {
                                                            toast({
                                                                variant: "destructive",
                                                                title: "Geen goedgekeurde weekstaten",
                                                                description: "Geen medewerkers hebben goedgekeurde weekstaten voor dit jaar."
                                                            });
                                                            return;
                                                        }
                                                        const allUsersIds = new Set(usersWithAnyLogs.map(u => u.uid!));
                                                        const allWeeksSet = new Set<string>();
                                                        usersWithAnyLogs.forEach(u => {
                                                            weekIdsInYear.forEach(weekId => {
                                                                if (approvedLogsInYear.some(log => log.userId === u.uid && log.weekId === weekId)) {
                                                                    allWeeksSet.add(weekId);
                                                                }
                                                            });
                                                        });
                                                        setSelectedUsers(allUsersIds);
                                                        setSelectedWeeks(allWeeksSet);
                                                    }}
                                                >
                                                    Alles
                                                </Button>
                                            </div>
                                        </TableHead>
                                        {visibleExportWeeks.map(weekId => {
                                            const weekNumber = weekId.split('-')[1];
                                            return (
                                                <TableHead key={weekId} className="text-center min-w-[100px]">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span>Week {weekNumber}</span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 px-2 text-xs"
                                                            onClick={() => {
                                                                const usersWithLogsForWeek = usersWithLogs.filter(u => 
                                                                    approvedLogsInYear.some(log => log.userId === u.uid && log.weekId === weekId)
                                                                );
                                                                
                                                                if (usersWithLogsForWeek.length === 0) {
                                                                    toast({
                                                                        variant: "destructive",
                                                                        title: "Geen goedgekeurde weekstaten",
                                                                        description: `Geen medewerkers hebben goedgekeurde weekstaten voor Week ${weekNumber} in ${selectedYear}.`
                                                                    });
                                                                    return;
                                                                }
                                                                
                                                                const allUsersSelectedForWeek = usersWithLogsForWeek.every(u => 
                                                                    selectedUsers.has(u.uid!) && selectedWeeks.has(weekId)
                                                                );
                                                                
                                                                const newWeekSet = new Set(selectedWeeks);
                                                                const newUserSet = new Set(selectedUsers);
                                                                
                                                                if (allUsersSelectedForWeek) {
                                                                    newWeekSet.delete(weekId);
                                                                    usersWithLogsForWeek.forEach(u => {
                                                                        const hasOtherWeeks = weekIdsInYear.some(w => 
                                                                            w !== weekId && 
                                                                            newWeekSet.has(w) &&
                                                                            newUserSet.has(u.uid!) &&
                                                                            approvedLogsInYear.some(log => log.userId === u.uid && log.weekId === w)
                                                                        );
                                                                        if (!hasOtherWeeks) {
                                                                            newUserSet.delete(u.uid!);
                                                                        }
                                                                    });
                                                                } else {
                                                                    newWeekSet.add(weekId);
                                                                    usersWithLogsForWeek.forEach(u => newUserSet.add(u.uid!));
                                                                }
                                                                
                                                                setSelectedWeeks(newWeekSet);
                                                                setSelectedUsers(newUserSet);
                                                            }}
                                                        >
                                                            {(() => {
                                                                const usersWithLogsForWeek = usersWithLogs.filter(u => 
                                                                    approvedLogsInYear.some(log => log.userId === u.uid && log.weekId === weekId)
                                                                );
                                                                if (usersWithLogsForWeek.length === 0) return '-';
                                                                const allSelected = usersWithLogsForWeek.every(u => 
                                                                    selectedUsers.has(u.uid!) && selectedWeeks.has(weekId)
                                                                );
                                                                return allSelected ? 'Aan' : 'Kies';
                                                            })()}
                                                        </Button>
                                                    </div>
                                                </TableHead>
                                            );
                                        })}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {usersWithLogs.map(user => {
                                        return (
                                            <TableRow key={user.uid}>
                                                <TableCell className="sticky left-0 bg-background z-10 font-medium">
                                                    <div className="flex items-center justify-between">
                                                        <span>{user.firstName} {user.lastName}</span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 px-2 text-xs"
                                                            onClick={() => {
                                                                const userApprovedWeeks = weekIdsInYear.filter(weekId =>
                                                                    approvedLogsInYear.some(log => log.userId === user.uid && log.weekId === weekId)
                                                                );
                                                                
                                                                if (userApprovedWeeks.length === 0) {
                                                                    toast({
                                                                        variant: "destructive",
                                                                        title: "Geen goedgekeurde weekstaten",
                                                                        description: `${user.firstName} ${user.lastName} heeft geen goedgekeurde weekstaten voor dit jaar.`
                                                                    });
                                                                    return;
                                                                }
                                                                
                                                                const allWeeksSelected = userApprovedWeeks.every(weekId => 
                                                                    selectedWeeks.has(weekId) && selectedUsers.has(user.uid!)
                                                                );
                                                                
                                                                const newWeekSet = new Set(selectedWeeks);
                                                                const newUserSet = new Set(selectedUsers);
                                                                
                                                                if (allWeeksSelected) {
                                                                    userApprovedWeeks.forEach(weekId => {
                                                                        const otherUsersForWeek = usersWithLogs.filter(u => 
                                                                            u.uid !== user.uid && 
                                                                            selectedUsers.has(u.uid!) &&
                                                                            approvedLogsInYear.some(log => log.userId === u.uid && log.weekId === weekId)
                                                                        );
                                                                        if (otherUsersForWeek.length === 0) {
                                                                            newWeekSet.delete(weekId);
                                                                        }
                                                                    });
                                                                    newUserSet.delete(user.uid!);
                                                                } else {
                                                                    newUserSet.add(user.uid!);
                                                                    userApprovedWeeks.forEach(weekId => newWeekSet.add(weekId));
                                                                }
                                                                
                                                                setSelectedWeeks(newWeekSet);
                                                                setSelectedUsers(newUserSet);
                                                            }}
                                                        >
                                                            {(() => {
                                                                const userApprovedWeeks = weekIdsInYear.filter(weekId =>
                                                                    approvedLogsInYear.some(log => log.userId === user.uid && log.weekId === weekId)
                                                                );
                                                                if (userApprovedWeeks.length === 0) return '-';
                                                                const allSelected = userApprovedWeeks.every(weekId => 
                                                                    selectedWeeks.has(weekId) && selectedUsers.has(user.uid!)
                                                                );
                                                                return allSelected ? 'Aan' : 'Kies';
                                                            })()}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                {visibleExportWeeks.map(weekId => {
                                                    const hasApprovedLog = approvedLogsInYear.some(log => 
                                                        log.userId === user.uid && log.weekId === weekId
                                                    );
                                                    const isSelected = selectedWeeks.has(weekId) && selectedUsers.has(user.uid!);
                                                    
                                                    return (
                                                        <TableCell key={weekId} className="text-center">
                                                            <Checkbox
                                                                checked={isSelected}
                                                                disabled={!hasApprovedLog}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked && !hasApprovedLog) {
                                                                        toast({
                                                                            variant: "destructive",
                                                                            title: "Geen goedgekeurde weekstaat",
                                                                            description: `${user.firstName} ${user.lastName} heeft geen goedgekeurde weekstaat voor Week ${weekId.split('-')[1]}.`
                                                                        });
                                                                        return;
                                                                    }
                                                                    
                                                                    const newWeekSet = new Set(selectedWeeks);
                                                                    const newUserSet = new Set(selectedUsers);
                                                                    
                                                                    if (checked) {
                                                                        newWeekSet.add(weekId);
                                                                        newUserSet.add(user.uid!);
                                                                    } else {
                                                                        const otherUsersForWeek = usersWithLogs.filter(u => 
                                                                            u.uid !== user.uid && 
                                                                            selectedUsers.has(u.uid!) &&
                                                                            approvedLogsInYear.some(log => log.userId === u.uid && log.weekId === weekId)
                                                                        );
                                                                        if (otherUsersForWeek.length === 0) {
                                                                            newWeekSet.delete(weekId);
                                                                        }
                                                                        
                                                                        const userOtherWeeks = weekIdsInYear.filter(w => 
                                                                            w !== weekId && 
                                                                            selectedWeeks.has(w) &&
                                                                            approvedLogsInYear.some(log => log.userId === user.uid && log.weekId === w)
                                                                        );
                                                                        if (userOtherWeeks.length === 0) {
                                                                            newUserSet.delete(user.uid!);
                                                                        } else {
                                                                            newUserSet.add(user.uid!);
                                                                        }
                                                                    }
                                                                    
                                                                    setSelectedWeeks(newWeekSet);
                                                                    setSelectedUsers(newUserSet);
                                                                }}
                                                            />
                                                        </TableCell>
                                                    );
                                                })}
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>

                            </Table>
                        </div>
                        
                        <div className="text-sm text-muted-foreground pt-2 border-t">
                            <p>Tip: Gebruik de kolomknoppen om een week voor alle medewerkers te selecteren, of links van elke medewerker om alle weken voor die medewerker te selecteren. Gebruik de pijlen bovenaan om door de weken van het jaar te bladeren.</p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
                            Annuleren
                        </Button>
                        <Button onClick={handleExport} disabled={selectedWeeks.size === 0 || selectedUsers.size === 0}>
                            <Download className="mr-2 h-4 w-4" />
                            Exporteer ({selectedWeeks.size} {selectedWeeks.size === 1 ? 'week' : 'weken'}, {selectedUsers.size} {selectedUsers.size === 1 ? 'medewerker' : 'medewerkers'})
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );

}
