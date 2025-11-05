

"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './use-auth';
import { supabase } from '@/lib/supabase/client';
import { getYear, getDay, isSameDay, parseISO, isWithinInterval, startOfMonth, endOfMonth, eachDayOfInterval, format, getISOWeek } from 'date-fns';
import { holidays } from '@/lib/holidays';
import type { WeeklyLog, DailyLog, LeaveRequest, DayStatus } from '@/lib/types';
import { calculateWorkHours } from './use-weekly-logs';
import { getWeekIdsForMonth } from '@/lib/utils';


const LEAVE_TABLE = 'leave_requests';
const LOGS_TABLE = 'weekly_logs';


export const useMonthlyReport = (monthDate: Date) => {
    const { user, isLoaded: authLoaded } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [totals, setTotals] = useState({
        totalHours: 0,
        hours100: 0,
        hours130: 0,
        hours150: 0,
        hours200: 0,
        surchargeHours19: 0,
        statusCounts: { gewerkt: 0, ziek: 0, vrij: 0, atv: 0, ouderschapsverlof: 0, feestdag: 0, weekend: 0, persoonlijk: 0, onbetaald: 0 },
        overnightStays: 0
    });

    const calculateMonthlyTotals = useCallback(async (date: Date) => {
        const defaultTotals = {
            totalHours: 0, hours100: 0, hours130: 0, hours150: 0, hours200: 0,
            surchargeHours19: 0,
            statusCounts: { gewerkt: 0, ziek: 0, vrij: 0, atv: 0, ouderschapsverlof: 0, feestdag: 0, weekend: 0, persoonlijk: 0, onbetaald: 0 },
            overnightStays: 0
        };

        if (!user) return defaultTotals;

        const weekIds = getWeekIdsForMonth(date);
        
        if (weekIds.length === 0) {
            return defaultTotals;
        }

        // 1. Fetch leave for the user for the relevant period to minimize data transfer
        const { data: leaveRows, error: leaveErr } = await supabase
          .from(LEAVE_TABLE)
          .select('*')
          .eq('user_id', user.uid)
          .eq('status', 'approved');
        if (leaveErr) throw leaveErr;
        const monthLeave = (leaveRows || []).map(r => ({
            id: r.id,
            userId: r.user_id,
            startDate: r.start_date,
            endDate: r.end_date,
            type: r.type,
            status: r.status,
            submittedAt: r.submitted_at,
            rejectionReason: r.rejection_reason,
        })) as LeaveRequest[];

        // 2. Fetch all relevant logs for the specified month using their weekIds
        const { data: logsRows, error: logsErr } = await supabase
          .from(LOGS_TABLE)
          .select('*')
          .eq('user_id', user.uid)
          .in('week_id', weekIds)
          .eq('status', 'approved');
        if (logsErr) throw logsErr;
        const monthlyLogs = (logsRows || []) as WeeklyLog[];
        
        const allDaysInMonth = eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) });
        const monthlyDataMap = new Map<string, Partial<DailyLog> & { status: DayStatus }>();

        // Pre-fill the map with leave, holidays, and weekends
        allDaysInMonth.forEach(currentDate => {
            const dateString = format(currentDate, 'yyyy-MM-dd');
            const dayOfWeek = getDay(currentDate);
            const onLeave = monthLeave.find(leave => isWithinInterval(currentDate, { start: parseISO(leave.startDate), end: parseISO(leave.endDate) }));
            const isHoliday = holidays.some(h => isSameDay(h.date, currentDate));

            if (onLeave) {
                if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday) {
                    monthlyDataMap.set(dateString, { status: onLeave.type === 'vakantie' ? 'vrij' : onLeave.type as any });
                }
            } else if (isHoliday) {
                monthlyDataMap.set(dateString, { status: 'feestdag' });
            } else if (dayOfWeek === 0 || dayOfWeek === 6) {
                monthlyDataMap.set(dateString, { status: 'weekend' });
            }
        });

        // Overwrite with actual worked days from logs
        const yearMonth = format(date, 'yyyy-MM');
        monthlyLogs.forEach(week => {
            week.days.forEach(day => {
                const dayDate = parseISO(day.date);
                if (format(dayDate, 'yyyy-MM') === yearMonth) {
                    const dateString = format(dayDate, 'yyyy-MM-dd');
                    // Always overwrite with log data, as it's more specific (e.g. sick on a leave day)
                    monthlyDataMap.set(dateString, day);
                }
            });
        });
        
        const weeklyTotals = new Map<string, { weekdayHours: number; saturdayHours: number; sundayHolidayHours: number; surchargeHours: number; overnights: number; }>();

        monthlyDataMap.forEach((dayData, dateString) => {
            const date = parseISO(dateString);
            const weekId = `${getYear(date)}-${getISOWeek(date)}`;
            if (!weeklyTotals.has(weekId)) weeklyTotals.set(weekId, { weekdayHours: 0, saturdayHours: 0, sundayHolidayHours: 0, surchargeHours: 0, overnights: 0 });
            
            const week = weeklyTotals.get(weekId)!;
            const dayOfWeek = getDay(date);
            const isHoliday = holidays.some(h => isSameDay(h.date, date));
            const day = dayData as DailyLog;

            if (day.status === 'gewerkt') {
                const workHours = calculateWorkHours(day);
                if(day.overnightStay) week.overnights++;

                const getOverlapMinutes = (start1: number, end1: number, start2: number, end2: number) => Math.max(0, Math.min(end1, end2) - Math.max(start1, start2));
                const startTimeInMinutes = (day.startTime?.hour || 0) * 60 + (day.startTime?.minute || 0);
                const endTimeInMinutes = (day.endTime?.hour || 0) * 60 + (day.endTime?.minute || 0);
                if (endTimeInMinutes > startTimeInMinutes) {
                    const surchargeMinutes = getOverlapMinutes(startTimeInMinutes, endTimeInMinutes, 0, 5 * 60) + getOverlapMinutes(startTimeInMinutes, endTimeInMinutes, 21 * 60, 24 * 60);
                    week.surchargeHours += surchargeMinutes / 60;
                }

                if (isHoliday || dayOfWeek === 0) week.sundayHolidayHours += workHours;
                else if (dayOfWeek === 6) week.saturdayHours += workHours;
                else week.weekdayHours += workHours;
            } else if (day.status !== 'weekend' && day.status !== 'feestdag') {
                if (['ziek', 'vrij', 'atv', 'ouderschapsverlof'].includes(day.status)){
                    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday) {
                       week.weekdayHours += 8;
                   }
                }
            }
        });
        
        let newTotals = { ...defaultTotals };
        weeklyTotals.forEach(week => {
            newTotals.surchargeHours19 += week.surchargeHours;
            newTotals.overnightStays += week.overnights;
            newTotals.hours150 += week.saturdayHours;
            newTotals.hours200 += week.sundayHolidayHours;

            if (week.weekdayHours > 40) {
                newTotals.hours100 += 40;
                newTotals.hours130 += week.weekdayHours - 40;
            } else {
                newTotals.hours100 += week.weekdayHours;
            }
        });

        allDaysInMonth.forEach(date => {
             const dateString = format(date, 'yyyy-MM-dd');
             const dayData = monthlyDataMap.get(dateString);
             if(dayData) {
                const statusKey = dayData.status as keyof typeof newTotals.statusCounts;
                if (newTotals.statusCounts.hasOwnProperty(statusKey)) {
                    newTotals.statusCounts[statusKey] += 1;
                }
             }
        });
        
        newTotals.totalHours = newTotals.hours100 + newTotals.hours130 + newTotals.hours150 + newTotals.hours200;
        
        return newTotals;

    }, [user]);

    useEffect(() => {
        if (authLoaded && user) {
            setIsLoading(true);
            calculateMonthlyTotals(monthDate).then(newTotals => {
                setTotals(newTotals);
                setIsLoading(false);
            });
        } else if (authLoaded) {
            setIsLoading(false);
        }
    }, [monthDate, user, authLoaded, calculateMonthlyTotals]);

    return { totals, isLoading };
}
