const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 (Sun) - 6 (Sat)
  const diff = (day === 0 ? -6 : 1 - day); // start on Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function formatWeekId(dateInput: string | Date) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const monday = startOfWeek(date);
  const yearStart = new Date(Date.UTC(monday.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((monday.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
  return `${monday.getUTCFullYear()}-${String(weekNumber).padStart(2, '0')}`;
}

export function formatYearMonth(dateInput: string | Date) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}






