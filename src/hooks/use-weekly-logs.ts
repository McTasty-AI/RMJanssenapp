"use client";

import { useState, useEffect, useCallback } from 'react';
import type { WeeklyLog, DailyLog, DayStatus, User, LeaveRequest, WeeklyLogStatus, Invoice, WeekDay, Toll, LeaveStatus } from '@/lib/types';
import { getYear, startOfWeek, addDays, format, getMonth, getDay, isSameDay, parseISO, isWithinInterval, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { nl } from 'date-fns/locale';
import { holidays, isHoliday } from '@/lib/holidays';

/**
 * Parse a date string (YYYY-MM-DD) to a local Date object
 * This avoids timezone issues when comparing dates
 */
function parseLocalDate(dateStr: string): Date {
  // If it's already a full ISO string with time, use parseISO
  if (dateStr.includes('T') || dateStr.includes('Z')) {
    const parsed = parseISO(dateStr);
    // Convert to local date by extracting year, month, day
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  // Otherwise, parse YYYY-MM-DD format directly
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}
import { useAuth } from './use-auth';
import { supabase } from '@/lib/supabase/client';
import { useToast } from './use-toast';
import { parseTimeString, parseIntervalString, getDateFromWeekId, getCustomWeek, getCustomWeekYear } from '@/lib/utils';
import { createInvoiceOnApproval, findCustomerByLicensePlate } from '@/lib/invoice-service';

const LOGS_COLLECTION = 'weekly_logs';
const LEAVE_COLLECTION = 'leave_requests';

// Helper function - gets the last end mileage from previous week
const getLastEndMileageFromPreviousWeek = async (weekStart: Date, userId: string): Promise<number> => {
  // Calculate previous week
  const previousWeekStart = addDays(weekStart, -7);
  const previousWeekEnd = addDays(previousWeekStart, 6);
  const previousYear = getCustomWeekYear(previousWeekStart);
  const previousWeek = getCustomWeek(previousWeekStart);
  const previousWeekId = `${previousYear}-${previousWeek}`;
  
  // Fetch the previous week's log
  const { data: previousWeeklyLog, error } = await supabase
    .from('weekly_logs')
    .select(`
      *,
      daily_logs (*)
    `)
    .eq('week_id', previousWeekId)
    .eq('user_id', userId)
    .single();

  // If no previous week exists or error occurred, return 0
  if (error && error.code === 'PGRST116') {
    // PGRST116 = no rows found, which is fine for the first week
    return 0;
  }

  if (error || !previousWeeklyLog || !previousWeeklyLog.daily_logs || !Array.isArray(previousWeeklyLog.daily_logs)) {
    return 0;
  }

  // Get all days from previous week, sorted by date (Monday to Sunday)
  const previousDays = (previousWeeklyLog.daily_logs as any[])
    .map((dl: any) => ({
      date: parseLocalDate(dl.date),
      endMileage: dl.end_mileage || 0,
      status: dl.status,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Start from the last day (Sunday) and work backwards to find the last end mileage
  // Include weekend days if they have an end mileage (driver worked on weekend)
  for (let i = previousDays.length - 1; i >= 0; i--) {
    const day = previousDays[i];
    if (day.endMileage && day.endMileage > 0) {
      return day.endMileage;
    }
  }

  return 0;
};

// Helper function - generates empty week and fills in approved leave requests
const generateEmptyWeek = async (date: Date, user: User, approvedLeaveRequests?: LeaveRequest[]): Promise<DailyLog[]> => {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  
  // Fetch approved leave requests if not provided
  let leaveRequests = approvedLeaveRequests;
  if (!leaveRequests) {
    // Only select needed fields for better performance
    const { data: leaveData } = await supabase
      .from('leave_requests')
      .select('id, user_id, start_date, end_date, type, status, submitted_at')
      .eq('user_id', user.uid)
      .eq('status', 'approved');
    
    leaveRequests = (leaveData || []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      userFirstName: '',
      userLastName: '',
      userEmail: '',
      startDate: r.start_date,
      endDate: r.end_date,
      type: r.type,
      reason: r.reason,
      status: r.status as LeaveStatus,
      submittedAt: r.submitted_at,
      rejectionReason: r.rejection_reason || undefined,
    })) as LeaveRequest[];
  }

  // Get last end mileage from previous week (includes weekend if driver worked)
  const lastEndMileage = await getLastEndMileageFromPreviousWeek(weekStart, user.uid!);
  
  const newDays: DailyLog[] = Array.from({ length: 7 }).map((_, i) => {
    const dayDate = addDays(weekStart, i);
    const dayOfWeek = getDay(dayDate);
    const dayName = format(dayDate, 'EEEE', { locale: nl }).toLowerCase() as WeekDay | 'zaterdag' | 'zondag';
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayIsHoliday = isHoliday(dayDate);
    
    // Check if this day falls within any approved leave request
    const leaveRequest = leaveRequests?.find(leave => {
      const leaveStart = parseISO(leave.startDate);
      const leaveEnd = parseISO(leave.endDate);
      return isWithinInterval(dayDate, { start: leaveStart, end: leaveEnd });
    });
    
    let status: DayStatus = 'gewerkt';
    if (dayIsHoliday) {
      status = 'feestdag';
    } else if (isWeekend) {
      status = 'weekend';
    } else if (leaveRequest) {
      // Map leave type to day status
      if (leaveRequest.type === 'vakantie') {
        status = 'vrij';
      } else if (leaveRequest.type === 'atv') {
        status = 'atv';
      } else if (leaveRequest.type === 'persoonlijk') {
        status = 'persoonlijk';
      } else if (leaveRequest.type === 'onbetaald') {
        status = 'onbetaald';
      } else {
        status = 'vrij'; // Default fallback
      }
    } else if (user.workDays && user.workDays.length > 0 && !user.workDays.includes(dayName as WeekDay)) {
      status = 'onbetaald';
    }

    // Set start mileage: use last end mileage from previous week for the first work day
    // For subsequent days, it will be updated by the form logic when end mileage is entered
    let startMileageValue = 0;
    if (i === 0 && status === 'gewerkt' && lastEndMileage > 0) {
      // First day (Monday) if it's a work day, use last end mileage from previous week
      startMileageValue = lastEndMileage;
    } else if (i > 0 && status === 'gewerkt') {
      // For subsequent work days, try to find the end mileage from the previous day in this week
      // This will be handled by the form logic, but we initialize to 0 here
      startMileageValue = 0;
    }

    return {
      date: format(dayDate, 'yyyy-MM-dd'), // Store as YYYY-MM-DD string to avoid timezone issues
      day: format(dayDate, 'EEEE', { locale: nl }).toLowerCase(),
      status: status,
      startTime: { hour: 0, minute: 0 },
      endTime: { hour: 0, minute: 0 },
      breakTime: { hour: 0, minute: 0 },
      startMileage: startMileageValue,
      endMileage: 0,
      toll: 'Geen' as Toll,
      licensePlate: undefined,
      overnightStay: false,
      tripNumber: '',
    };
  });

  if (user.assignedLicensePlates && user.assignedLicensePlates.length === 1) {
    newDays.forEach(day => {
        if (day.status === 'gewerkt') {
            day.licensePlate = user.assignedLicensePlates![0];
        }
    });
  }
  return newDays;
};

export const calculateWorkHours = (day: DailyLog): number => {
    if (!day || day.status !== 'gewerkt' || !day.startTime || !day.endTime) return 0;
    const startMinutes = (day.startTime?.hour || 0) * 60 + (day.startTime?.minute || 0);
    const endMinutes = (day.endTime?.hour || 0) * 60 + (day.endTime?.minute || 0);
    const breakMinutes = (day.breakTime?.hour || 0) * 60 + (day.breakTime?.minute || 0);
    if (endMinutes <= startMinutes) return 0;
    const workMinutes = endMinutes - startMinutes - breakMinutes;
    return Math.max(0, workMinutes) / 60;
};

const cleanLogForSupabase = (log: WeeklyLog): any => {
    // Create a clean object with only the fields we need for Supabase
    const cleanedLog: any = {
        week_id: log.weekId,
        user_id: log.userId,
        remarks: log.remarks || '',
        submitted_at: log.submittedAt || null,
        status: log.status || 'concept',
    };
    
    // Calculate year_month from first day
    if (log.days && log.days.length > 0) {
        const weekStartDate = parseISO(log.days[0].date);
        cleanedLog.year_month = format(weekStartDate, 'yyyy-MM');
    }
    
    return cleanedLog;
};

export const useWeeklyLogs = (currentDate?: Date) => {
  const { user, isLoaded: authIsLoaded } = useAuth();
  const [weekData, setWeekData] = useState<WeeklyLog | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!authIsLoaded) return;
    
    if (!user || !currentDate) {
      setIsLoaded(true);
      setWeekData(null);
      return;
    }

    // Calculate week start (Monday) and then get custom week number
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const year = getCustomWeekYear(weekStart);
    const week = getCustomWeek(weekStart);
    const weekId = `${year}-${week}`;
    
    setIsLoaded(false);

    // Fetch weekly log with daily logs
    const fetchWeekData = async () => {
      const { data: weeklyLog, error } = await supabase
        .from('weekly_logs')
        .select(`
          *,
          daily_logs (*)
        `)
        .eq('week_id', weekId)
        .eq('user_id', user.uid)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error("[useWeeklyLogs] Error:", error);
        setIsLoaded(true);
        return;
      }

      if (!weeklyLog) {
        // Create empty week with approved leave automatically filled in
        const finalDays = await generateEmptyWeek(currentDate, user);
        setWeekData({
          weekId: weekId,
          userId: user.uid!,
          days: finalDays,
          status: 'concept',
          remarks: ''
        });
        setIsLoaded(true);
      } else {
        // Transform Supabase data to WeeklyLog format
        // First, fetch approved leave requests to check if any days should be updated
        const { data: leaveData } = await supabase
          .from('leave_requests')
          .select('*')
          .eq('user_id', user.uid)
          .eq('status', 'approved');
        
        const approvedLeaveRequests = (leaveData || []).map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          userFirstName: '',
          userLastName: '',
          userEmail: '',
          startDate: r.start_date,
          endDate: r.end_date,
          type: r.type,
          reason: r.reason,
          status: r.status as LeaveStatus,
          submittedAt: r.submitted_at,
          rejectionReason: r.rejection_reason || undefined,
        })) as LeaveRequest[];
        
        const days = (weeklyLog.daily_logs || [])
          .map((dl: any): DailyLog => {
            // Parse the date and recalculate the correct day name and status to ensure consistency
            const dayDate = parseLocalDate(dl.date);
            const correctDayName = format(dayDate, 'EEEE', { locale: nl }).toLowerCase();
            const dayOfWeek = getDay(dayDate);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const dayIsHoliday = isHoliday(dayDate);
            
            // Check if this day falls within any approved leave request
            const leaveRequest = approvedLeaveRequests.find(leave => {
              const leaveStart = parseISO(leave.startDate);
              const leaveEnd = parseISO(leave.endDate);
              return isWithinInterval(dayDate, { start: leaveStart, end: leaveEnd });
            });
            
            // Validate and correct status based on date and leave requests
            let correctStatus = dl.status;
            if (dayIsHoliday && dl.status !== 'gewerkt' && dl.status !== 'ziek' && dl.status !== 'vrij' && dl.status !== 'ouderschapsverlof' && dl.status !== 'cursus') {
              correctStatus = 'feestdag';
            } else if (isWeekend && !dayIsHoliday && dl.status !== 'gewerkt' && dl.status !== 'ziek' && dl.status !== 'vrij' && dl.status !== 'ouderschapsverlof' && dl.status !== 'cursus') {
              correctStatus = 'weekend';
            } else if (leaveRequest && !isWeekend && !dayIsHoliday) {
              // If there's an approved leave request for this day, use the leave type
              if (leaveRequest.type === 'vakantie') {
                correctStatus = 'vrij';
              } else if (leaveRequest.type === 'atv') {
                correctStatus = 'atv';
              } else if (leaveRequest.type === 'persoonlijk') {
                correctStatus = 'persoonlijk';
              } else if (leaveRequest.type === 'onbetaald') {
                correctStatus = 'onbetaald';
              }
            } else if (!dayIsHoliday && !isWeekend && dl.status === 'feestdag') {
              // If it's not a holiday but status is feestdag, reset to gewerkt
              correctStatus = 'gewerkt';
            } else if (!isWeekend && !dayIsHoliday && dl.status === 'weekend') {
              // If it's not a weekend but status is weekend, reset to gewerkt
              correctStatus = 'gewerkt';
            }
            
            return {
              date: dl.date,
              day: correctDayName, // Use recalculated day name instead of stored day_name
              status: correctStatus, // Use validated status with leave requests applied
              startTime: (dl.start_time ? parseTimeString(dl.start_time) : undefined) || { hour: 0, minute: 0 },
              endTime: (dl.end_time ? parseTimeString(dl.end_time) : undefined) || { hour: 0, minute: 0 },
              breakTime: (dl.break_time ? parseIntervalString(dl.break_time) : undefined) || { hour: 0, minute: 0 },
              startMileage: dl.start_mileage || 0,
              endMileage: dl.end_mileage || 0,
              toll: (dl.toll as Toll) || ('Geen' as Toll),
              licensePlate: dl.license_plate || undefined,
              overnightStay: dl.overnight_stay || false,
              tripNumber: dl.trip_number || '',
            };
          })
          // Filter to only include days from the correct week (Monday to Sunday)
          .filter((day: DailyLog) => {
            const dayDate = parseLocalDate(day.date);
            const dayWeekStart = startOfWeek(dayDate, { weekStartsOn: 1 });
            return isSameDay(dayWeekStart, weekStart);
          })
          // Sort by date to ensure Monday comes first
          .sort((a: DailyLog, b: DailyLog) => {
            const dateA = parseLocalDate(a.date).getTime();
            const dateB = parseLocalDate(b.date).getTime();
            return dateA - dateB;
          });

        // Get last end mileage from previous week for potential use in merge
        const lastEndMileage = await getLastEndMileageFromPreviousWeek(weekStart, user.uid!);
        
        // Helper function to merge days, ensuring start mileage is set correctly for first work day
        const mergeDaysWithStartMileage = (finalDays: DailyLog[], existingDays: DailyLog[]) => {
          return finalDays.map((finalDay, index) => {
            const existingDay = existingDays.find((d: DailyLog) => {
              const existingDateStr = d.date.includes('T') ? d.date.split('T')[0] : d.date;
              const finalDateStr = finalDay.date.includes('T') ? finalDay.date.split('T')[0] : finalDay.date;
              return existingDateStr === finalDateStr;
            });
            
            if (existingDay) {
              // If existing day has no start mileage but it's the first work day, use last end mileage
              const mergedDay = { ...existingDay };
              if (index === 0 && mergedDay.status === 'gewerkt' && (!mergedDay.startMileage || mergedDay.startMileage === 0) && lastEndMileage > 0) {
                mergedDay.startMileage = lastEndMileage;
              }
              return mergedDay;
            }
            return finalDay;
          });
        };

        // If we don't have exactly 7 days, regenerate the week to ensure we have all days
        if (days.length !== 7) {
          const finalDays = await generateEmptyWeek(currentDate, user, approvedLeaveRequests);
          // Merge with existing data if available, ensuring start mileage is set correctly
          const mergedDays = mergeDaysWithStartMileage(finalDays, days);
          setWeekData({
            weekId: weeklyLog.week_id,
            userId: weeklyLog.user_id,
            days: mergedDays,
            status: weeklyLog.status,
            remarks: weeklyLog.remarks || '',
            submittedAt: weeklyLog.submitted_at,
          });
        } else {
          // Verify that the first day is actually Monday
          const firstDayDate = parseISO(days[0].date);
          const firstDayOfWeek = getDay(firstDayDate);
          if (firstDayOfWeek !== 1) {
            // First day is not Monday, regenerate the week
            const finalDays = await generateEmptyWeek(currentDate, user, approvedLeaveRequests);
            // Merge with existing data if available, ensuring start mileage is set correctly
            const mergedDays = mergeDaysWithStartMileage(finalDays, days);
            setWeekData({
              weekId: weeklyLog.week_id,
              userId: weeklyLog.user_id,
              days: mergedDays,
              status: weeklyLog.status,
              remarks: weeklyLog.remarks || '',
              submittedAt: weeklyLog.submitted_at,
            });
          } else {
            // Even if we have 7 days, check if first work day needs start mileage from previous week
            const updatedDays = days.map((day, index) => {
              if (index === 0 && day.status === 'gewerkt' && (!day.startMileage || day.startMileage === 0) && lastEndMileage > 0) {
                return { ...day, startMileage: lastEndMileage };
              }
              return day;
            });
            setWeekData({
              weekId: weeklyLog.week_id,
              userId: weeklyLog.user_id,
              days: updatedDays,
              status: weeklyLog.status,
              remarks: weeklyLog.remarks || '',
              submittedAt: weeklyLog.submitted_at,
            });
          }
        }
        setIsLoaded(true);
      }
    };

    fetchWeekData();

    // Subscribe to changes
    const channel = supabase
      .channel('weekly-logs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weekly_logs',
          filter: `week_id=eq.${weekId}`,
        },
        () => {
          fetchWeekData();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [currentDate, user, authIsLoaded]);

  const saveLog = useCallback(async (data: any, newStatus: WeeklyLogStatus): Promise<void> => {
    if (!user) {
        console.error("[saveLog] Save attempted without a user.");
        return;
    }

    // Ensure userId is set correctly
    if (!data.userId) {
        data.userId = user.uid;
    }

    // If trying to submit, first check the current status in DB
    if (newStatus === 'pending') {
        const { data: existingLog } = await supabase
            .from('weekly_logs')
            .select('status')
            .eq('week_id', data.weekId)
            .eq('user_id', user.uid)
            .single();

        if (existingLog) {
            if (existingLog.status === 'pending' || existingLog.status === 'approved') {
                toast({
                    variant: 'destructive',
                    title: 'Indienen Mislukt',
                    description: 'Deze weekstaat is al ingediend of goedgekeurd.'
                });
                return;
            }
        }
    }
    
    const logData = cleanLogForSupabase(data);
    logData.status = newStatus;
    
    if (newStatus === 'pending' && data.status !== 'pending') {
        logData.submitted_at = new Date().toISOString();
    }

    // Upsert weekly log
    const { error: weeklyError } = await supabase
        .from('weekly_logs')
        .upsert(logData, { onConflict: 'week_id,user_id' });

    if (weeklyError) {
        console.error("[saveLog] Error saving weekly log:", weeklyError);
        const errorMessage = weeklyError.message || weeklyError.code || 'Onbekende fout';
        console.error("[saveLog] Error details:", {
            message: weeklyError.message,
            code: weeklyError.code,
            details: weeklyError.details,
            hint: weeklyError.hint,
            fullError: weeklyError
        });
        toast({
            variant: 'destructive',
            title: 'Opslaan Mislukt',
            description: `De weekstaat kon niet worden opgeslagen: ${errorMessage}`
        });
        return;
    }

    // Get the weekly log ID
    const { data: savedLog } = await supabase
        .from('weekly_logs')
        .select('id')
        .eq('week_id', data.weekId)
        .eq('user_id', user.uid)
        .single();

    if (!savedLog) {
        console.error("[saveLog] Could not retrieve saved log");
        return;
    }

    // Calculate the correct week start based on weekId
    const weekStartDate = getDateFromWeekId(data.weekId);
    if (!weekStartDate) {
        console.error("[saveLog] Could not parse weekId:", data.weekId);
        toast({
            variant: 'destructive',
            title: 'Fout bij opslaan',
            description: 'Kon week-ID niet parsen.'
        });
        return;
    }
    const weekStart = startOfWeek(weekStartDate, { weekStartsOn: 1 });

    // Save daily logs
    for (let i = 0; i < data.days.length; i++) {
        const day = data.days[i];
        
        // Calculate the correct date for this day index (0 = Monday, 1 = Tuesday, etc.)
        const correctDate = addDays(weekStart, i);
        const dateValue = format(correctDate, 'yyyy-MM-dd');
        
        // Convert break_time to PostgreSQL interval format (HH:MM:SS)
        let breakTimeInterval: string | null = null;
        if (day.breakTime && (day.breakTime.hour > 0 || day.breakTime.minute > 0)) {
            // Convert to interval format: "HH:MM:SS"
            breakTimeInterval = `${String(day.breakTime.hour).padStart(2, '0')}:${String(day.breakTime.minute).padStart(2, '0')}:00`;
        }
        
        // Parse the date to recalculate correct day name and validate status
        const dayDate = parseLocalDate(dateValue);
        const correctDayName = format(dayDate, 'EEEE', { locale: nl }).toLowerCase();
        const dayOfWeek = getDay(dayDate);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dayIsHoliday = isHoliday(dayDate);
        
        // Validate feestdag status - must be on an actual holiday
        if (day.status === 'feestdag' && !dayIsHoliday) {
            toast({
                variant: 'destructive',
                title: 'Geen feestdag',
                description: `De datum ${format(dayDate, 'dd-MM-yyyy')} is geen feestdag. De status 'Feestdag' kan alleen gebruikt worden op officiële feestdagen.`
            });
            // Don't save this day - return early to prevent saving invalid data
            return;
        }
        
        // Validate and correct status based on date
        let correctStatus = day.status;
        if (dayIsHoliday && day.status !== 'gewerkt' && day.status !== 'ziek' && day.status !== 'vrij' && day.status !== 'ouderschapsverlof' && day.status !== 'cursus') {
            // If it's a holiday and status is not one that can override holiday, set to feestdag
            correctStatus = 'feestdag';
        } else if (isWeekend && !dayIsHoliday && day.status !== 'gewerkt' && day.status !== 'ziek' && day.status !== 'vrij' && day.status !== 'ouderschapsverlof' && day.status !== 'cursus') {
            // If it's a weekend (not a holiday) and status is not one that can override weekend, set to weekend
            correctStatus = 'weekend';
        } else if (!isWeekend && !dayIsHoliday && day.status === 'weekend') {
            // If it's not a weekend but status is weekend, reset to gewerkt
            correctStatus = 'gewerkt';
        }

        const { error: dailyError } = await supabase
            .from('daily_logs')
            .upsert({
                weekly_log_id: savedLog.id,
                date: dateValue, // Use the calculated correct date, not the stored date
                day_name: correctDayName, // Use recalculated day name
                status: correctStatus, // Use validated status
                start_time: day.startTime ? `${String(day.startTime.hour).padStart(2, '0')}:${String(day.startTime.minute).padStart(2, '0')}:00` : null,
                end_time: day.endTime ? `${String(day.endTime.hour).padStart(2, '0')}:${String(day.endTime.minute).padStart(2, '0')}:00` : null,
                break_time: breakTimeInterval,
                start_mileage: day.startMileage || 0,
                end_mileage: day.endMileage || 0,
                toll: day.toll || 'Geen',
                license_plate: day.licensePlate,
                overnight_stay: day.overnightStay || false,
                trip_number: day.tripNumber || '',
            }, { onConflict: 'weekly_log_id,date' });

        if (dailyError) {
            console.error("[saveLog] Error saving daily log:", dailyError);
            toast({
                variant: 'destructive',
                title: 'Fout bij opslaan dag',
                description: `Kon dag ${day.day} niet opslaan: ${dailyError.message || 'Onbekende fout'}`
            });
            return;
        }
    }

    toast({
        title: 'Opgeslagen',
        description: 'De weekstaat is opgeslagen.'
    });
  }, [user, toast]);
  
  const unlockLog = useCallback(async (weekId: string, driverUid: string): Promise<void> => {
    if (!user || user.role !== 'admin' || !driverUid) {
      throw new Error('Niet geautoriseerd');
    }
    
    const { error } = await supabase
        .from('weekly_logs')
        .update({ status: 'concept' })
        .eq('week_id', weekId)
        .eq('user_id', driverUid);

    if (error) {
        console.error("[unlockLog] Error:", error);
        throw new Error(error.message || 'Fout bij ontgrendelen');
    }
  }, [user]);

  const approveLog = useCallback(async (log: WeeklyLog): Promise<boolean> => {
    if (!user || user.role !== 'admin' || !log.userId) {
      console.log("[approveLog] Early return: no user or not admin or no userId");
      return false;
    }
    
    console.log("[approveLog] Starting approval for week:", log.weekId);
    
    // Update status to approved FIRST (always approve the timesheet)
    const { error: updateError } = await supabase
        .from('weekly_logs')
        .update({ status: 'approved' })
        .eq('week_id', log.weekId)
        .eq('user_id', log.userId);

    if (updateError) {
        console.error("[approveLog] Error updating status:", updateError);
        toast({
            variant: 'destructive',
            title: 'Fout bij goedkeuren',
            description: updateError.message || 'De weekstaat kon niet worden goedgekeurd.'
        });
        return false;
    }

    console.log("[approveLog] Status updated to approved");

    // Try to create invoice automatically (only if customer is linked)
    try {
        const customer = await findCustomerByLicensePlate(log);
        
        if (!customer) {
            // Collect unique license plates from the week
            const licensePlates = [...new Set(log.days
                .filter(day => day.licensePlate && day.status === 'gewerkt')
                .map(day => day.licensePlate)
                .filter(Boolean)
            )];
            
            const platesText = licensePlates.length > 0 
                ? ` (${licensePlates.join(', ')})` 
                : '';
            
            toast({ 
                variant: 'destructive', 
                title: 'Weekstaat goedgekeurd', 
                description: `De weekstaat is goedgekeurd, maar er is geen klant gekoppeld aan de kentekens${platesText}. Er is geen factuur aangemaakt. Koppel een klant aan de kentekens om automatisch facturen te kunnen aanmaken.`,
                duration: 10000
            });
            return true; // Still return true because approval succeeded
        }

        // Customer found, create invoice
        const result = await createInvoiceOnApproval(log);
        
        console.log("[approveLog] Invoice created successfully");
        
        toast({ 
            title: 'Weekstaat goedgekeurd', 
            description: `De weekstaat is goedgekeurd en een conceptfactuur is aangemaakt voor: ${result.customerName}` 
        });
        return true;
    } catch (error: any) {
        console.error("Error creating draft invoice:", error);
        // Status is already approved, just show warning
        toast({ 
            variant: 'destructive', 
            title: 'Weekstaat goedgekeurd', 
            description: `De weekstaat is goedgekeurd, maar de factuur kon niet worden aangemaakt: ${error.message || 'Onbekende fout'}.` 
        });
        return true; // Still return true because approval succeeded
    }
  }, [user, toast]);
  
  const updateUserPlates = useCallback(async (uid: string, plates: string[]): Promise<void> => {
    if (!user || user.role !== 'admin' || !uid) return;
    
    const { error } = await supabase
        .from('profiles')
        .update({ assigned_license_plates: plates })
        .eq('id', uid);

    if (error) {
        console.error("[updateUserPlates] Error:", error);
    }
  }, [user]);

  return { isLoaded, weekData, saveLog, unlockLog, approveLog, updateUserPlates };
};
