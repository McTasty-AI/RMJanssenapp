import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getISOWeek, getISOWeekYear, startOfMonth, endOfMonth, eachWeekOfInterval, getYear, getMonth, addDays, startOfWeek, eachYearOfInterval, startOfYear, endOfYear, parse } from 'date-fns';

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
      const year = getISOWeekYear(weekStartDate);
      const weekNumber = getISOWeek(weekStartDate);
      return `${year}-${weekNumber}`;
  }).filter((id): id is string => {
    // Correctly determine if the week belongs to the target month.
    // A common definition is that if Thursday of the week is in the month, the week belongs to the month.
    const weekStartDate = startOfWeek(new Date(parseInt(id.split('-')[0]), 0, (parseInt(id.split('-')[1]) - 1) * 7 + 1), { weekStartsOn: 1 });
    const thursdayOfWeek = addDays(weekStartDate, 3);
    return getMonth(thursdayOfWeek) === targetMonth;
  });
    
  return [...new Set(weekIds)]; // Return unique week IDs
}

export function getWeekIdsForYear(date: Date): string[] {
    const year = getYear(date);
    const start = startOfYear(date);
    const end = endOfYear(date);
    const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });

    return weeks.map(weekStartDate => {
        // Ensure the week belongs to the target year, as the first/last week can overlap.
        // A week belongs to the year that contains its Thursday.
        const thursdayOfWeek = addDays(weekStartDate, 3);
        if (getYear(thursdayOfWeek) === year) {
             const weekYear = getISOWeekYear(weekStartDate);
             const weekNumber = getISOWeek(weekStartDate);
             return `${weekYear}-${weekNumber}`;
        }
        return null;
    }).filter((id): id is string => id !== null);
}

export function getDateFromWeekId(weekId: string): Date | null {
  const match = weekId.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const weekNumber = parseInt(match[2], 10);

  if (isNaN(year) || isNaN(weekNumber) || weekNumber < 1 || weekNumber > 53) return null;
  
  try {
    // Start with Jan 4th of the year, which is always in week 1
    const jan4 = new Date(year, 0, 4);
    // Find the start of week 1
    const firstDayOfWeek1 = startOfWeek(jan4, { weekStartsOn: 1 });
    // Add the number of weeks (minus 1) to get to the correct week
    const targetDate = addDays(firstDayOfWeek1, (weekNumber - 1) * 7);
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
