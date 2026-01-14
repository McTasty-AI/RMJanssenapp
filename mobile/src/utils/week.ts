const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 (Sun) - 6 (Sat)
  const diff = (day === 0 ? -6 : 1 - day); // start on Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * ISO week calculation: Week 1 is the week that contains January 4th
 * (or equivalently, the week that contains the first Thursday of the year)
 * This is the standard ISO 8601 week numbering system.
 */

/**
 * Get ISO week number for a date (1-53)
 * ISO 8601: Week 1 is the week containing January 4th
 */
function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  
  // Get the Thursday of the current week (ISO weeks start on Monday)
  const day = d.getUTCDay();
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + (4 - day)); // 4 is Thursday
  
  // Get January 4th of the year containing the Thursday
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const jan4Day = jan4.getUTCDay();
  const jan4Thursday = new Date(jan4);
  jan4Thursday.setUTCDate(4 + (4 - jan4Day));
  
  // Calculate the week number
  const daysDiff = Math.floor((thursday.getTime() - jan4Thursday.getTime()) / MS_PER_DAY);
  const weekNumber = Math.floor(daysDiff / 7) + 1;
  
  return Math.max(1, Math.min(weekNumber, 53));
}

/**
 * Get ISO week year for a date
 * ISO 8601: The year that contains the Thursday of the week
 */
function getISOWeekYear(date: Date): number {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  
  // Get the Thursday of the current week
  const day = d.getUTCDay();
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + (4 - day)); // 4 is Thursday
  
  return thursday.getUTCFullYear();
}

/**
 * Format week ID using ISO week numbering
 * ISO 8601: Week 1 is the week containing January 4th
 */
export function formatWeekId(dateInput: string | Date) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const isoYear = getISOWeekYear(date);
  const isoWeek = getISOWeek(date);
  
  return `${isoYear}-${String(isoWeek).padStart(2, '0')}`;
}

export function formatYearMonth(dateInput: string | Date) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}






