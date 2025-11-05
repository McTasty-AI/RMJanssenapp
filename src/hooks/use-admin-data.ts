"use client";

import { useState, useEffect } from 'react';
import { useAuth } from './use-auth';
import { supabase } from '@/lib/supabase/client';
import type { User, WeeklyLog, Declaration, LeaveRequest, Fine, Vehicle } from '@/lib/types';
import { mapSupabaseToApp, parseTimeString, parseIntervalString, getDateFromWeekId } from '@/lib/utils';
import { format, parseISO, getDay, isSameDay, startOfWeek, addDays } from 'date-fns';
import { nl } from 'date-fns/locale';
import { holidays } from '@/lib/holidays';

export const useAdminData = () => {
    const { user: currentUser, isLoaded: authIsLoaded } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [logs, setLogs] = useState<WeeklyLog[]>([]);
    const [declarations, setDeclarations] = useState<Declaration[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [fines, setFines] = useState<Fine[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authIsLoaded) return;

        if (!currentUser || currentUser.role !== 'admin') {
            setLoading(false);
            return;
        }

        setLoading(true);
        
        let loadedCount = 0;
        const totalQueries = 6;

        const checkLoading = () => {
            loadedCount++;
            if (loadedCount === totalQueries) {
                setLoading(false);
            }
        };

        // Fetch users
        supabase
            .from('profiles')
            .select('*')
            .order('first_name')
            .then(({ data, error }) => {
                if (error) {
                    console.error("Error fetching users:", error);
                } else {
                    setUsers(((data || []).map(doc => ({ uid: doc.id, ...mapSupabaseToApp<User>(doc) }))));
                }
                checkLoading();
            });

        // Fetch weekly logs with daily logs
        supabase
            .from('weekly_logs')
            .select('*, daily_logs (*)')
            .order('week_id', { ascending: false })
            .then(({ data, error }) => {
                if (error) {
                    console.error("Error fetching logs:", error);
                } else {
                    // Transform Supabase data to WeeklyLog format with days
                    const transformedLogs = (data || []).map((log: any) => {
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
                                    if (isHoliday && dl.status !== 'gewerkt' && dl.status !== 'ziek' && dl.status !== 'vrij' && dl.status !== 'ouderschapsverlof') {
                                        correctStatus = 'feestdag';
                                    } else if (isWeekend && !isHoliday && dl.status !== 'gewerkt' && dl.status !== 'ziek' && dl.status !== 'vrij' && dl.status !== 'ouderschapsverlof') {
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
                                        const existingDay = days.find((d: any) => d.date === dateStr);
                                        
                                        return existingDay || {
                                            date: dayDate.toISOString().split('T')[0],
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
                    });
                    setLogs(transformedLogs);
                }
                checkLoading();
            });

        // Fetch declarations
        supabase
            .from('declarations')
            .select('*')
            .then(({ data, error }) => {
                if (error) {
                    console.error("Error fetching declarations:", error);
                } else {
                    setDeclarations(((data || []).map(doc => mapSupabaseToApp<Declaration>(doc))));
                }
                checkLoading();
            });

        // Fetch leave requests
        supabase
            .from('leave_requests')
            .select('*')
            .then(({ data, error }) => {
                if (error) {
                    console.error("Error fetching leave requests:", error);
                } else {
                    setLeaveRequests(((data || []).map(doc => mapSupabaseToApp<LeaveRequest>(doc))));
                }
                checkLoading();
            });

        // Fetch fines
        supabase
            .from('fines')
            .select('*')
            .then(({ data, error }) => {
                if (error) {
                    console.error("Error fetching fines:", error);
                } else {
                    setFines(((data || []).map(doc => mapSupabaseToApp<Fine>(doc))));
                }
                checkLoading();
            });

        // Fetch vehicles
        supabase
            .from('vehicles')
            .select('*')
            .then(({ data, error }) => {
                if (error) {
                    console.error("Error fetching vehicles:", error);
                } else {
                    setVehicles(((data || []).map(doc => mapSupabaseToApp<Vehicle>(doc))));
                }
                checkLoading();
            });

    }, [currentUser, authIsLoaded]);

    return { users, logs, declarations, leaveRequests, fines, vehicles, loading };
};
