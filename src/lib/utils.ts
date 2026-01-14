import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfMonth, endOfMonth, eachWeekOfInterval, getYear, getMonth, addDays, startOfWeek, eachYearOfInterval, startOfYear, endOfYear, parse, getDay, getISOWeek, getISOWeekYear, setISOWeek, startOfISOWeek } from 'date-fns';

/**
 * ISO week calculation: Week 1 is the week that contains January 4th
 * (or equivalently, the week that contains the first Thursday of the year)
 * This is the standard ISO 8601 week numbering system.
 */

/**
 * Get the ISO week number for a date (1-53)
 * Uses ISO 8601 week numbering: week 1 is the week containing January 4th
 */
export function getCustomWeek(date: Date): number {
  return getISOWeek(date);
}

/**
 * Get the ISO week year for a date
 * Uses ISO 8601 week numbering: the year that contains the Thursday of the week
 */
export function getCustomWeekYear(date: Date): number {
  return getISOWeekYear(date);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getWeekIdsForMonth(date: Date): string[] {
  const targetMonth = getMonth(date);
  const targetYear = getYear(date);
  const start = startOfMonth(date);
  const end = endOfMonth(date);

  // Get all weeks that overlap with the month
  // We need to include weeks that start before the month (if they overlap)
  // and weeks that start during or after the month (if they overlap)
  const weekStart = startOfWeek(start, { weekStartsOn: 1 });
  const weekEnd = startOfWeek(end, { weekStartsOn: 1 });
  
  // Generate all weeks from the week before the month start to the week after the month end
  const weeks: Date[] = [];
  let currentWeek = weekStart;
  // Go back one week to include weeks that start before the month
  currentWeek = addDays(currentWeek, -7);
  
  // Generate weeks until we've covered the month end
  while (currentWeek <= addDays(weekEnd, 7)) {
    weeks.push(currentWeek);
    currentWeek = addDays(currentWeek, 7);
  }

  const weekIds = weeks.map(weekStartDate => {
      const year = getISOWeekYear(weekStartDate);
      const weekNumber = getISOWeek(weekStartDate);
      return `${year}-${String(weekNumber).padStart(2, '0')}`;
  }).filter((id): id is string => {
    // Correctly determine if the week belongs to the target month.
    // A week belongs to the month if any day of the week is in the month.
    const weekStartDate = getDateFromWeekId(id);
    if (!weekStartDate) return false;
    // Check if any day of the week falls in the target month
    for (let i = 0; i < 7; i++) {
      const dayInWeek = addDays(weekStartDate, i);
      if (getMonth(dayInWeek) === targetMonth && getYear(dayInWeek) === targetYear) {
        return true;
      }
    }
    return false;
  });
    
  return [...new Set(weekIds)]; // Return unique week IDs
}

export function getWeekIdsForYear(date: Date): string[] {
    const year = getYear(date);
    const weekIds: string[] = [];
    
    // Start from January 1st of the year
    const jan1 = new Date(year, 0, 1);
    // Get the ISO week year for Jan 1
    const isoYear = getISOWeekYear(jan1);
    
    // If ISO year differs from calendar year, start from the first week of the ISO year
    let startDate = jan1;
    if (isoYear !== year) {
      // Find the first week of the ISO year
      startDate = startOfISOWeek(setISOWeek(new Date(isoYear, 0, 4), 1));
    }
    
    // Generate all weeks for the ISO year (up to 53 weeks)
    for (let weekNum = 1; weekNum <= 53; weekNum++) {
      const weekStart = startOfISOWeek(setISOWeek(startDate, weekNum));
      const weekYear = getISOWeekYear(weekStart);
      
      // Only include weeks that belong to the target ISO year
      if (weekYear === year) {
        weekIds.push(`${weekYear}-${String(weekNum).padStart(2, '0')}`);
      }
    }
    
    return weekIds;
}

export function getDateFromWeekId(weekId: string): Date | null {
  const match = weekId.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;

  const isoYear = parseInt(match[1], 10);
  const weekNumber = parseInt(match[2], 10);

  if (isNaN(isoYear) || isNaN(weekNumber) || weekNumber < 1 || weekNumber > 53) return null;
  
  try {
    // Use ISO week calculation: week 1 contains January 4th
    // Set the date to January 4th of the ISO year, then set the ISO week
    const jan4 = new Date(isoYear, 0, 4);
    const targetDate = startOfISOWeek(setISOWeek(jan4, weekNumber));
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
