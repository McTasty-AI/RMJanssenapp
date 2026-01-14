import { createHash } from 'crypto';

export function computeTollImportHash(input: {
  license_plate: string;
  transaction_date: string; // yyyy-MM-dd
  transaction_time?: string; // HH:mm (optional if user didn't map time)
  amount: number;
  include_time?: boolean;
  country?: string | null; // Optional country to ensure uniqueness when time is not available
  location?: string | null; // Optional location to ensure uniqueness when time is not available
  rowIndex?: number; // Optional row index as last resort to ensure uniqueness
}): string {
  const plate = String(input.license_plate || '').trim().toUpperCase();
  const date = String(input.transaction_date || '').trim();
  const includeTime = Boolean(input.include_time);
  const time = String(input.transaction_time || '').trim();
  const amount = Number(input.amount ?? 0);
  // Stable, locale-independent formatting (2 decimals)
  const amt = amount.toFixed(2);
  
  // Build unique key from all available fields to ensure uniqueness
  // Priority: time > country > location > rowIndex
  // Always use time if it's valid (even if not explicitly mapped)
  let uniqueKey = '';
  
  if (time && time !== '00:00') {
    // Use time if available and valid
    uniqueKey = `t:${time}`;
  } else {
    // No valid time - use country, location, and row index for uniqueness
    const country = String(input.country || '').trim();
    const location = String(input.location || '').trim();
    
    // Build composite key from all available fields
    // Always include rowIndex to ensure uniqueness even when other fields are the same
    const parts: string[] = [];
    if (country) parts.push(`c:${country}`);
    if (location) parts.push(`l:${location}`);
    // Always include rowIndex if available to ensure uniqueness
    // This prevents duplicate hashes when multiple rows have the same plate, date, amount, country, and location
    if (input.rowIndex !== undefined) {
      parts.push(`r:${input.rowIndex}`);
    }
    
    uniqueKey = parts.join('|');
    
    // If we still don't have a unique key and time is "00:00", include it anyway
    // This helps distinguish transactions that might otherwise collide
    if (!uniqueKey && time === '00:00') {
      uniqueKey = 't:00:00';
    }
  }
  
  // If we still don't have a unique key, use a combination of all fields
  // This should rarely happen, but ensures we always have uniqueness
  if (!uniqueKey) {
    const country = String(input.country || '').trim();
    const location = String(input.location || '').trim();
    const parts: string[] = [];
    if (time) parts.push(`t:${time}`);
    if (country) parts.push(`c:${country}`);
    if (location) parts.push(`l:${location}`);
    if (input.rowIndex !== undefined) parts.push(`r:${input.rowIndex}`);
    uniqueKey = parts.join('|') || 'default';
  }
  
  return createHash('md5').update(`${plate}${date}${uniqueKey}${amt}`, 'utf8').digest('hex');
}

