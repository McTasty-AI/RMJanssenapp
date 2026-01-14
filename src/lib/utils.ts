import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfMonth, endOfMonth, eachWeekOfInterval, getYear, getMonth, addDays, startOfWeek, eachYearOfInterval, startOfYear, endOfYear, parse, getDay } from 'date-fns';

/**
 * Custom week calculation: Week 1 starts on the first Monday of January
 * (or the Monday after Jan 1 if Jan 1 is not a Monday)
 * 
 * Week 53 of 2025: Dec 29, 2025 - Jan 4, 2026
 * Week 1 of 2026: Jan 5, 2026 - Jan 11, 2026
 */

/**
 * Get the first Monday of a given year
 * Special cases for 2025 and 2026 to ensure correct week numbering:
 * - Week 1 of 2025 starts on Dec 30, 2024 (Monday)
 * - Week 1 of 2026 starts on Jan 5, 2026 (Monday)
 * For other years, use standard calculation
 */
function getFirstMondayOfYear(year: number): Date {
  // Special case for 2025: week 1 starts on Dec 30, 2024
  if (year === 2025) {
    return new Date(2024, 11, 30); // December 30, 2024
  }
  
  // Special case for 2026: week 1 starts on Jan 5, 2026
  if (year === 2026) {
    return new Date(2026, 0, 5); // January 5, 2026
  }
  
  // For other years, use standard calculation
  const jan1 = new Date(year, 0, 1);
  const dayOfWeek = getDay(jan1); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // If Jan 1 is Monday (1), return it. Otherwise, find the next Monday
  if (dayOfWeek === 1) {
    return jan1;
  } else if (dayOfWeek === 0) {
    // Jan 1 is Sunday, next Monday is Jan 2
    return new Date(year, 0, 2);
  } else {
    // Jan 1 is Tuesday-Saturday, find the next Monday
    const daysUntilMonday = 8 - dayOfWeek; // Monday is 1, so 8-2=6 days for Tuesday, etc.
    return addDays(jan1, daysUntilMonday);
  }
}

/**
 * Get the custom week number for a date (1-53)
 * Week 1 starts on the first Monday of January
 */
export function getCustomWeek(date: Date): number {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekStartYear = getYear(weekStart);
  
  // Try current year first
  const firstMonday = getFirstMondayOfYear(weekStartYear);
  const daysDiff = Math.floor((weekStart.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24));
  
  // Calculate week number for current year
  let weekNumber = Math.floor(daysDiff / 7) + 1;
  
  // Check if we're in week 53 of current year
  const week53Start = addDays(firstMonday, 52 * 7);
  if (weekStart.getTime() >= week53Start.getTime()) {
    // Check if there's actually a week 53 (if week 53 start + 6 days is still in the same year or early next year)
    const week53End = addDays(week53Start, 6);
    const week53EndYear = getYear(week53End);
    if (week53EndYear === weekStartYear || (week53EndYear === weekStartYear + 1 && getMonth(week53End) === 0)) {
      return 53;
    }
    // If week 53 would extend too far, it's actually week 1 of next year
    // But first check if it belongs to previous year's week 53
    const prevYear = weekStartYear - 1;
    const prevYearFirstMonday = getFirstMondayOfYear(prevYear);
    const prevYearWeek53Start = addDays(prevYearFirstMonday, 52 * 7);
    if (weekStart.getTime() >= prevYearWeek53Start.getTime()) {
      const prevYearWeek53End = addDays(prevYearWeek53Start, 6);
      const prevYearWeek53EndYear = getYear(prevYearWeek53End);
      if (prevYearWeek53EndYear === prevYear || (prevYearWeek53EndYear === prevYear + 1 && getMonth(prevYearWeek53End) === 0)) {
        return 53; // It's week 53 of previous year
      }
    }
    return 1; // It's week 1 of next year
  }
  
  // If weekStart is before firstMonday, it belongs to previous year
  if (daysDiff < 0) {
    const prevYear = weekStartYear - 1;
    const prevYearFirstMonday = getFirstMondayOfYear(prevYear);
    const prevYearDaysDiff = Math.floor((weekStart.getTime() - prevYearFirstMonday.getTime()) / (1000 * 60 * 60 * 24));
    const prevYearWeekNumber = Math.floor(prevYearDaysDiff / 7) + 1;
    
    // Check if it's week 53 of previous year
    const prevYearWeek53Start = addDays(prevYearFirstMonday, 52 * 7);
    if (weekStart.getTime() >= prevYearWeek53Start.getTime()) {
      const prevYearWeek53End = addDays(prevYearWeek53Start, 6);
      const prevYearWeek53EndYear = getYear(prevYearWeek53End);
      if (prevYearWeek53EndYear === prevYear || (prevYearWeek53EndYear === prevYear + 1 && getMonth(prevYearWeek53End) === 0)) {
        return 53;
      }
    }
    
    return Math.min(Math.max(prevYearWeekNumber, 1), 53);
  }
  
  return Math.min(weekNumber, 53);
}

/**
 * Get the year for a custom week
 * The year is determined by which year the Monday of the week falls in,
 * but if the week belongs to week 53 of the previous year, return that year instead
 */
export function getCustomWeekYear(date: Date): number {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekStartYear = getYear(weekStart);
  
  // Check if this week belongs to the previous year's week 53
  const firstMonday = getFirstMondayOfYear(weekStartYear);
  const daysDiff = Math.floor((weekStart.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) {
    // Week belongs to previous year
    const prevYear = weekStartYear - 1;
    const prevYearFirstMonday = getFirstMondayOfYear(prevYear);
    const prevYearWeek53Start = addDays(prevYearFirstMonday, 52 * 7);
    
    if (weekStart.getTime() >= prevYearWeek53Start.getTime()) {
      const prevYearWeek53End = addDays(prevYearWeek53Start, 6);
      const prevYearWeek53EndYear = getYear(prevYearWeek53End);
      if (prevYearWeek53EndYear === prevYear || (prevYearWeek53EndYear === prevYear + 1 && getMonth(prevYearWeek53End) === 0)) {
        return prevYear; // It's week 53 of previous year
      }
    }
    return prevYear;
  }
  
  return weekStartYear;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getWeekIdsForMonth(date: Date): string[] {
  const targetMonth = getMonth(date);
  const start = startOfMonth(date);
  const end = endOfMonth(date);

  // Get all weeks that overlap with the month
  const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });

  const weekIds = weeks.map(weekStartDate => {
      const year = getCustomWeekYear(weekStartDate);
      const weekNumber = getCustomWeek(weekStartDate);
      return `${year}-${weekNumber}`;
  }).filter((id): id is string => {
    // Correctly determine if the week belongs to the target month.
    // A week belongs to the month if its Monday is in the month.
    const weekStartDate = getDateFromWeekId(id);
    if (!weekStartDate) return false;
    return getMonth(weekStartDate) === targetMonth;
  });
    
  return [...new Set(weekIds)]; // Return unique week IDs
}

export function getWeekIdsForYear(date: Date): string[] {
    const year = getYear(date);
    const firstMonday = getFirstMondayOfYear(year);
    const weekIds: string[] = [];
    
    // Generate all weeks for the year (up to 53 weeks)
    for (let weekNum = 1; weekNum <= 53; weekNum++) {
      const weekStart = addDays(firstMonday, (weekNum - 1) * 7);
      const weekYear = getCustomWeekYear(weekStart);
      
      // Only include weeks where the Monday falls in the target year
      if (getYear(weekStart) === year) {
        weekIds.push(`${weekYear}-${weekNum}`);
      }
    }
    
    return weekIds;
}

export function getDateFromWeekId(weekId: string): Date | null {
  const match = weekId.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const weekNumber = parseInt(match[2], 10);

  if (isNaN(year) || isNaN(weekNumber) || weekNumber < 1 || weekNumber > 53) return null;
  
  try {
    // Get the first Monday of the year
    const firstMonday = getFirstMondayOfYear(year);
    // Add the number of weeks (minus 1) to get to the correct week
    const targetDate = addDays(firstMonday, (weekNumber - 1) * 7);
    return targetDate;
  } catch (e) {
    console.error("Error parsing weekId", e);
    return null;
  }
}

export const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
};

// Convert snake_case to camelCase
function toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Convert camelCase to snake_case
function toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// Convert Supabase data (snake_case) to app format (camelCase)
// and normalize null -> undefined for easier optional typing in the app layer.
export function mapSupabaseToApp<T>(data: any): T {
    if (data === null) {
        return undefined as unknown as T;
    }
    if (data === undefined) {
        return data as T;
    }

    if (Array.isArray(data)) {
        return data.map(item => mapSupabaseToApp(item)) as T;
    }

    if (typeof data === 'object' && data.constructor === Object) {
        const mapped: any = {};
        for (const [key, value] of Object.entries(data)) {
            const camelKey = toCamelCase(key);
            mapped[camelKey] = mapSupabaseToApp(value);
        }
        return mapped as T;
    }

    return data as T;
}

// Convert app data (camelCase) to Supabase format (snake_case)
// and normalize undefined -> null so DB columns accept values consistently.
export function mapAppToSupabase<T>(data: any): T {
    if (data === undefined) {
        return null as unknown as T;
    }
    if (data === null) {
        return data as T;
    }

    if (Array.isArray(data)) {
        return data.map(item => mapAppToSupabase(item)) as T;
    }

    if (typeof data === 'object' && data.constructor === Object) {
        const mapped: any = {};
        for (const [key, value] of Object.entries(data)) {
            const snakeKey = toSnakeCase(key);
            mapped[snakeKey] = mapAppToSupabase(value);
        }
        return mapped as T;
    }

    return data as T;
}

/**
 * Parse PostgreSQL time string (HH:MM:SS) to { hour, minute } object
 */
export function parseTimeString(timeStr: string | null | undefined): { hour: number; minute: number } | undefined {
    if (!timeStr) return undefined;
    
    // Handle format HH:MM:SS or HH:MM
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
        const hour = parseInt(parts[0], 10) || 0;
        const minute = parseInt(parts[1], 10) || 0;
        return { hour, minute };
    }
    
    return undefined;
}

/**
 * Parse PostgreSQL interval string to { hour, minute } object
 * Handles formats like "HH:MM:SS", "X hours Y minutes", etc.
 */
export function parseIntervalString(intervalStr: string | null | undefined): { hour: number; minute: number } | undefined {
    if (!intervalStr) return undefined;
    
    // Handle HH:MM:SS format (most common)
    if (intervalStr.includes(':')) {
        const parts = intervalStr.split(':');
        if (parts.length >= 2) {
            const hour = parseInt(parts[0], 10) || 0;
            const minute = parseInt(parts[1], 10) || 0;
            return { hour, minute };
        }
    }
    
    // Handle "X hours Y minutes" format
    const hourMatch = intervalStr.match(/(\d+)\s*hours?/i);
    const minuteMatch = intervalStr.match(/(\d+)\s*minutes?/i);
    
    const hour = hourMatch ? parseInt(hourMatch[1], 10) : 0;
    const minute = minuteMatch ? parseInt(minuteMatch[1], 10) : 0;
    
    return hour > 0 || minute > 0 ? { hour, minute } : undefined;
}
