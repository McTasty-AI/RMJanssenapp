import { createHash } from 'crypto';

export function computeTollImportHash(input: {
  license_plate: string;
  transaction_date: string; // yyyy-MM-dd
  transaction_time?: string; // HH:mm (optional if user didn't map time)
  amount: number;
  include_time?: boolean;
}): string {
  const plate = String(input.license_plate || '').trim().toUpperCase();
  const date = String(input.transaction_date || '').trim();
  const includeTime = Boolean(input.include_time);
  const time = includeTime ? String(input.transaction_time || '').trim() : '';
  const amount = Number(input.amount ?? 0);
  // Stable, locale-independent formatting (2 decimals)
  const amt = amount.toFixed(2);
  return createHash('md5').update(`${plate}${date}${time}${amt}`, 'utf8').digest('hex');
}

