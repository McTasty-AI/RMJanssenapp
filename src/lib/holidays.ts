// src/lib/holidays.ts

import { isSameDay, startOfDay, addDays, getDay } from 'date-fns';

export interface Holiday {
  name: string;
  date: Date;
}

/**
 * Create a date normalized to midnight in local timezone
 * This prevents timezone issues when comparing dates
 */
function createLocalDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

/**
 * Calculate Easter Sunday using the algorithm by Gauss
 * Returns the date of Easter Sunday for the given year
 */
function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return createLocalDate(year, month, day);
}

/**
 * Calculate all Dutch holidays for a given year
 */
function calculateHolidaysForYear(year: number): Holiday[] {
  const holidays: Holiday[] = [];
  
  // Fixed holidays
  holidays.push({ name: "Nieuwjaarsdag", date: createLocalDate(year, 1, 1) });
  holidays.push({ name: "Bevrijdingsdag", date: createLocalDate(year, 5, 5) });
  holidays.push({ name: "Eerste Kerstdag", date: createLocalDate(year, 12, 25) });
  holidays.push({ name: "Tweede Kerstdag", date: createLocalDate(year, 12, 26) });
  
  // Koningsdag: 27 april, but if it falls on Sunday, then 26 april
  const koningsdagDate = createLocalDate(year, 4, 27);
  const koningsdagDay = getDay(koningsdagDate);
  if (koningsdagDay === 0) { // Sunday
    holidays.push({ name: "Koningsdag", date: createLocalDate(year, 4, 26) });
  } else {
    holidays.push({ name: "Koningsdag", date: koningsdagDate });
  }
  
  // Calculate Easter-based holidays
  const easter = calculateEaster(year);
  const goedeVrijdag = addDays(easter, -2);
  const tweedePaasdag = addDays(easter, 1);
  const hemelvaartsdag = addDays(easter, 39);
  const eerstePinksterdag = addDays(easter, 49);
  const tweedePinksterdag = addDays(easter, 50);
  
  holidays.push({ name: "Goede Vrijdag", date: goedeVrijdag });
  holidays.push({ name: "Eerste Paasdag", date: easter });
  holidays.push({ name: "Tweede Paasdag", date: tweedePaasdag });
  holidays.push({ name: "Hemelvaartsdag", date: hemelvaartsdag });
  holidays.push({ name: "Eerste Pinksterdag", date: eerstePinksterdag });
  holidays.push({ name: "Tweede Pinksterdag", date: tweedePinksterdag });
  
  return holidays;
}

// Cache for calculated holidays to avoid recalculating
const holidaysCache = new Map<number, Holiday[]>();

/**
 * Get all holidays for a specific year (cached)
 */
function getHolidaysForYear(year: number): Holiday[] {
  if (!holidaysCache.has(year)) {
    holidaysCache.set(year, calculateHolidaysForYear(year));
  }
  return holidaysCache.get(year)!;
}

/**
 * Get all holidays for a range of years
 */
function getAllHolidays(startYear: number = 2000, endYear: number = 2100): Holiday[] {
  const holidays: Holiday[] = [];
  for (let year = startYear; year <= endYear; year++) {
    holidays.push(...getHolidaysForYear(year));
  }
  return holidays;
}

// Initialize with a large range (2000-2100) to cover all reasonable use cases
// This is calculated once at module load time
const allHolidays: Holiday[] = getAllHolidays(2000, 2100);

/**
 * Check if a given date is a holiday
 * @param date - The date to check
 * @returns true if the date is a holiday, false otherwise
 */
export function isHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const normalizedDate = startOfDay(date);
  
  // Get holidays for this year (and ensure cache is populated)
  const yearHolidays = getHolidaysForYear(year);
  
  // Also check adjacent years in case of year boundary issues
  const prevYearHolidays = year > 1900 ? getHolidaysForYear(year - 1) : [];
  const nextYearHolidays = year < 2100 ? getHolidaysForYear(year + 1) : [];
  const allYearHolidays = [...prevYearHolidays, ...yearHolidays, ...nextYearHolidays];
  
  return allYearHolidays.some(h => {
    const normalizedHoliday = startOfDay(h.date);
    // Compare year, month, and day directly to avoid timezone issues
    return normalizedHoliday.getFullYear() === normalizedDate.getFullYear() &&
           normalizedHoliday.getMonth() === normalizedDate.getMonth() &&
           normalizedHoliday.getDate() === normalizedDate.getDate();
  });
}

/**
 * Get the holiday name for a given date, if it exists
 * @param date - The date to check
 * @returns The holiday name if the date is a holiday, undefined otherwise
 */
export function getHolidayName(date: Date): string | undefined {
  const year = date.getFullYear();
  const normalizedDate = startOfDay(date);
  
  // Get holidays for this year
  const yearHolidays = getHolidaysForYear(year);
  
  // Also check adjacent years in case of year boundary issues
  const prevYearHolidays = year > 1900 ? getHolidaysForYear(year - 1) : [];
  const nextYearHolidays = year < 2100 ? getHolidaysForYear(year + 1) : [];
  const allYearHolidays = [...prevYearHolidays, ...yearHolidays, ...nextYearHolidays];
  
  const holiday = allYearHolidays.find(h => {
    const normalizedHoliday = startOfDay(h.date);
    return normalizedHoliday.getFullYear() === normalizedDate.getFullYear() &&
           normalizedHoliday.getMonth() === normalizedDate.getMonth() &&
           normalizedHoliday.getDate() === normalizedDate.getDate();
  });
  return holiday?.name;
}

// Export for backward compatibility
// This array contains all holidays from 2000-2100, calculated dynamically
export const holidays: Holiday[] = allHolidays;
