

"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './use-auth';
import { supabase } from '@/lib/supabase/client';
import { getYear, getDay, isSameDay, parseISO, isWithinInterval, startOfMonth, endOfMonth, eachDayOfInterval, format, getISOWeek, startOfWeek, addDays } from 'date-fns';
import { nl } from 'date-fns/locale';
import { holidays } from '@/lib/holidays';
import type { WeeklyLog, DailyLog, LeaveRequest, DayStatus } from '@/lib/types';
import { calculateWorkHours } from './use-weekly-logs';
import { getWeekIdsForMonth, parseTimeString, parseIntervalString, getDateFromWeekId, mapSupabaseToApp } from '@/lib/utils';


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
        statusCounts: { gewerkt: 0, ziek: 0, vrij: 0, atv: 0, ouderschapsverlof: 0, feestdag: 0, weekend: 0, persoonlijk: 0, onbetaald: 0, cursus: 0 },
        overnightStays: 0
    });

    const calculateMonthlyTotals = useCallback(async (date: Date) => {
        const defaultTotals = {
            totalHours: 0, hours100: 0, hours130: 0, hours150: 0, hours200: 0,
            surchargeHours19: 0,
            statusCounts: { gewerkt: 0, ziek: 0, vrij: 0, atv: 0, ouderschapsverlof: 0, feestdag: 0, weekend: 0, persoonlijk: 0, onbetaald: 0, cursus: 0 },
            overnightStays: 0
        };

        if (!user) return defaultTotals;

        const weekIds = getWeekIdsForMonth(date);
        
        if (weekIds.length === 0) {
            return defaultTotals;
        }

        // 1. Fetch leave for the user for the relevant period - only select needed fields
        const { data: leaveRows, error: leaveErr } = await supabase
          .from(LEAVE_TABLE)
          .select('id, user_id, start_date, end_date, type, status, submitted_at')
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
          .select('*, daily_logs (*)')
          .eq('user_id', user.uid)
          .in('week_id', weekIds)
          .eq('status', 'approved');
        if (logsErr) throw logsErr;
        
        // Transform Supabase data to WeeklyLog format with days
        const monthlyLogs = (logsRows || []).map((log: any) => {
            const base = mapSupabaseToApp<WeeklyLog>(log);
            
            // Calculate the correct week start based on weekId
            const weekStartDate = getDateFromWeekId(log.week_id);
            if (!weekStartDate) {
                console.error("Invalid weekId:", log.week_id);
                (base as any).days = [];
                return base;
            }
            const weekStart = startOfWeek(weekStartDate, { weekStartsOn: 1 });
            
            // Transform daily_logs array to days array
            if (log.daily_logs && Array.isArray(log.daily_logs)) {
                const days = log.daily_logs
                    .map((dl: any) => {
                        // Parse the date and recalculate the correct day name and status to ensure consistency
                        const dayDate = parseISO(dl.date);
                        const correctDayName = format(dayDate, 'EEEE', { locale: nl }).toLowerCase();
                        const dayOfWeek = getDay(dayDate);
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        const isHoliday = holidays.some(h => isSameDay(h.date, dayDate));
                        
                        // Validate and correct status based on date
                        let correctStatus = dl.status;
                        if (isHoliday && dl.status !== 'gewerkt' && dl.status !== 'ziek' && dl.status !== 'vrij' && dl.status !== 'ouderschapsverlof' && dl.status !== 'cursus') {
                            correctStatus = 'feestdag';
                        } else if (isWeekend && !isHoliday && dl.status !== 'gewerkt' && dl.status !== 'ziek' && dl.status !== 'vrij' && dl.status !== 'ouderschapsverlof' && dl.status !== 'cursus') {
                            correctStatus = 'weekend';
                        } else if (!isHoliday && !isWeekend && dl.status === 'feestdag') {
                            // If it's not a holiday but status is feestdag, reset to gewerkt
                            correctStatus = 'gewerkt';
                        } else if (!isWeekend && !isHoliday && dl.status === 'weekend') {
                            // If it's not a weekend but status is weekend, reset to gewerkt
                            correctStatus = 'gewerkt';
                        }
                        
                        return {
                            date: dl.date,
                            day: correctDayName, // Use recalculated day name
                            status: correctStatus, // Use validated status
                            startTime: dl.start_time ? parseTimeString(dl.start_time) : { hour: 0, minute: 0 },
                            endTime: dl.end_time ? parseTimeString(dl.end_time) : { hour: 0, minute: 0 },
                            breakTime: dl.break_time ? parseIntervalString(dl.break_time) : { hour: 0, minute: 0 },
                            startMileage: dl.start_mileage || 0,
                            endMileage: dl.end_mileage || 0,
                            toll: dl.toll || 'Geen',
                            licensePlate: dl.license_plate,
                            overnightStay: dl.overnight_stay || false,
                            tripNumber: dl.trip_number || '',
                        };
                    })
                    // Filter to only include days from the correct week (Monday to Sunday)
                    .filter((day: any) => {
                        const dayDate = parseISO(day.date);
                        const dayWeekStart = startOfWeek(dayDate, { weekStartsOn: 1 });
                        return isSameDay(dayWeekStart, weekStart);
                    })
                    // Sort by date to ensure Monday comes first
                    .sort((a: any, b: any) => {
                        const dateA = parseISO(a.date).getTime();
                        const dateB = parseISO(b.date).getTime();
                        return dateA - dateB;
                    });
                
                // If we don't have exactly 7 days, regenerate the week to ensure we have all days
                if (days.length !== 7) {
                    // Generate the correct days for this week
                    const expectedDays = Array.from({ length: 7 }).map((_, i) => {
                        const dayDate = addDays(weekStart, i);
                        const dayOfWeek = getDay(dayDate);
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        const isHoliday = holidays.some(h => isSameDay(h.date, dayDate));
                        
                        let status: any = 'gewerkt';
                        if (isHoliday) {
                            status = 'feestdag';
                        } else if (isWeekend) {
                            status = 'weekend';
                        }
                        
                        const dateStr = format(dayDate, 'yyyy-MM-dd');
                        
                        // Try to find existing data for this date
                        const existingDay = days.find((d: any) => {
                            const existingDateStr = d.date.includes('T') ? d.date.split('T')[0] : d.date;
                            return existingDateStr === dateStr;
                        });
                        
                        return existingDay || {
                            date: dateStr, // Use formatted date string, not ISO string
                            day: format(dayDate, 'EEEE', { locale: nl }).toLowerCase(),
                            status: status,
                            startTime: { hour: 0, minute: 0 },
                            endTime: { hour: 0, minute: 0 },
                            breakTime: { hour: 0, minute: 0 },
                            startMileage: 0,
                            endMileage: 0,
                            toll: 'Geen',
                            licensePlate: undefined,
                            overnightStay: false,
                            tripNumber: '',
                        };
                    });
                    
                    (base as any).days = expectedDays;
                } else {
                    // Verify that the first day is actually Monday
                    const firstDayDate = parseISO(days[0].date);
                    const firstDayOfWeek = getDay(firstDayDate);
                    if (firstDayOfWeek !== 1) {
                        // First day is not Monday, regenerate the week
                        const expectedDays = Array.from({ length: 7 }).map((_, i) => {
                            const dayDate = addDays(weekStart, i);
                            const dayOfWeek = getDay(dayDate);
                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                            const isHoliday = holidays.some(h => isSameDay(h.date, dayDate));
                            
                            let status: any = 'gewerkt';
                            if (isHoliday) {
                                status = 'feestdag';
                            } else if (isWeekend) {
                                status = 'weekend';
                            }
                            
                            const dateStr = format(dayDate, 'yyyy-MM-dd');
                            
                            // Try to find existing data for this date
                            const existingDay = days.find((d: any) => d.date === dateStr || (d.date.includes('T') && d.date.split('T')[0] === dateStr));
                            
                            return existingDay || {
                                date: dateStr,
                                day: format(dayDate, 'EEEE', { locale: nl }).toLowerCase(),
                                status: status,
                                startTime: { hour: 0, minute: 0 },
                                endTime: { hour: 0, minute: 0 },
                                breakTime: { hour: 0, minute: 0 },
                                startMileage: 0,
                                endMileage: 0,
                                toll: 'Geen',
                                licensePlate: undefined,
                                overnightStay: false,
                                tripNumber: '',
                            };
                        });
                        
                        (base as any).days = expectedDays;
                    } else {
                        (base as any).days = days;
                    }
                }
            } else {
                (base as any).days = [];
            }
            return base;
        }) as WeeklyLog[];
        
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

                // Bepaal waar de uren bij horen: zondag/feestdag gewerkt = 200%, zaterdag = 150%, weekdagen = 100%/130%
                if (isHoliday || dayOfWeek === 0) {
                    // Gewerkt op zondag of feestdag = altijd 200%
                    week.sundayHolidayHours += workHours;
                } else if (dayOfWeek === 6) {
                    // Gewerkt op zaterdag = altijd 150%
                    week.saturdayHours += workHours;
                } else {
                    // Gewerkt op weekdag
                    week.weekdayHours += workHours;
                }
            } else if (['ziek', 'vrij', 'atv', 'ouderschapsverlof', 'cursus', 'feestdag', 'persoonlijk', 'onbetaald'].includes(day.status)) {
                // Deze statussen tellen als 8 uur voor salarisadministratie
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    week.weekdayHours += 8;
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
