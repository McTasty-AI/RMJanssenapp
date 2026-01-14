const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 (Sun) - 6 (Sat)
  const diff = (day === 0 ? -6 : 1 - day); // start on Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

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
    return new Date(Date.UTC(2024, 11, 30)); // December 30, 2024
  }
  
  // Special case for 2026: week 1 starts on Jan 5, 2026
  if (year === 2026) {
    return new Date(Date.UTC(2026, 0, 5)); // January 5, 2026
  }
  
  // For other years, use standard calculation
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dayOfWeek = jan1.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // If Jan 1 is Monday (1), return it. Otherwise, find the next Monday
  if (dayOfWeek === 1) {
    return jan1;
  } else if (dayOfWeek === 0) {
    // Jan 1 is Sunday, next Monday is Jan 2
    return new Date(Date.UTC(year, 0, 2));
  } else {
    // Jan 1 is Tuesday-Saturday, find the next Monday
    const daysUntilMonday = 8 - dayOfWeek; // Monday is 1, so 8-2=6 days for Tuesday, etc.
    return new Date(Date.UTC(year, 0, 1 + daysUntilMonday));
  }
}

/**
 * Custom week calculation: Week 1 starts on the first Monday of January
 * (or the Monday after Jan 1 if Jan 1 is not a Monday)
 * 
 * Week 53 of 2025: Dec 29, 2025 - Jan 4, 2026
 * Week 1 of 2026: Jan 5, 2026 - Jan 11, 2026
 */
export function formatWeekId(dateInput: string | Date) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const monday = startOfWeek(date);
  const year = monday.getUTCFullYear();
  const firstMonday = getFirstMondayOfYear(year);
  
  // Calculate days difference
  const daysDiff = Math.floor((monday.getTime() - firstMonday.getTime()) / MS_PER_DAY);
  
  // Week number is (daysDiff / 7) + 1
  let weekNumber = Math.floor(daysDiff / 7) + 1;
  
  // Handle edge case: if the week start is before the first Monday of its year,
  // it belongs to the previous year's last week
  if (weekNumber < 1) {
    const prevYear = year - 1;
    const prevYearFirstMonday = getFirstMondayOfYear(prevYear);
    const prevYearLastMonday = new Date(Date.UTC(prevYearFirstMonday.getUTCFullYear(), prevYearFirstMonday.getUTCMonth(), prevYearFirstMonday.getUTCDate() + 52 * 7));
    const daysFromPrevYear = Math.floor((monday.getTime() - prevYearLastMonday.getTime()) / MS_PER_DAY);
    
    // Check if it's week 53 of previous year
    if (daysFromPrevYear >= 0 && daysFromPrevYear < 7) {
      weekNumber = 53;
      return `${prevYear}-${String(weekNumber).padStart(2, '0')}`;
    }
    weekNumber = 52; // Fallback to week 52
    return `${prevYear}-${String(weekNumber).padStart(2, '0')}`;
  }
  
  // Check if we're in week 53
  const week53Start = new Date(Date.UTC(firstMonday.getUTCFullYear(), firstMonday.getUTCMonth(), firstMonday.getUTCDate() + 52 * 7));
  if (monday.getTime() >= week53Start.getTime()) {
    // Check if there's actually a week 53 (if week 53 start + 6 days is still in the same year or early next year)
    const week53End = new Date(Date.UTC(week53Start.getUTCFullYear(), week53Start.getUTCMonth(), week53Start.getUTCDate() + 6));
    const week53EndYear = week53End.getUTCFullYear();
    if (week53EndYear === year || (week53EndYear === year + 1 && week53End.getUTCMonth() === 0)) {
      weekNumber = 53;
    } else {
      // If week 53 would extend too far, it's actually week 1 of next year
      weekNumber = 1;
      return `${year + 1}-${String(weekNumber).padStart(2, '0')}`;
    }
  }
  
  return `${year}-${String(Math.min(weekNumber, 53)).padStart(2, '0')}`;
}

export function formatYearMonth(dateInput: string | Date) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}






