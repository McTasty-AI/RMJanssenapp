import * as XLSX from 'xlsx';

export type TollTransactionImportRow = {
  license_plate: string;
  transaction_date: string; // ISO yyyy-MM-dd
  transaction_time: string; // HH:mm
  amount: number;
  vat_rate: number; // BTW percentage
  country: string | null;
  location: string | null;
};

export type TollColumnMapping = {
  license_plate: string; // header label
  transaction_date: string; // header label
  amount: string; // header label
  transaction_time?: string; // header label (optional)
  country?: string; // header label (optional)
  vat_rate?: string; // header label (optional)
  location?: string; // header label (optional)
};

type HeaderKey =
  | 'license_plate'
  | 'transaction_date'
  | 'transaction_time'
  | 'amount'
  | 'vat_rate'
  | 'country'
  | 'location';

function normalizeHeader(h: any): HeaderKey | string {
  const key = String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (key.includes('kenteken') || key.includes('license') || key.includes('plate') || key.includes('nummerplaat')) {
    return 'license_plate';
  }
  if (key.includes('datum') || key.includes('date')) {
    return 'transaction_date';
  }
  if (key.includes('tijd') || key.includes('time') || key.includes('uur')) {
    return 'transaction_time';
  }
  if (key.includes('bedrag') || key.includes('amount') || key.includes('prijs') || key.includes('total')) {
    return 'amount';
  }
  if (key.includes('btw') || key.includes('vat')) {
    return 'vat_rate';
  }
  if (key.includes('land') || key.includes('country') || key.includes('serviceland')) {
    return 'country';
  }
  if (key.includes('locatie') || key.includes('location') || key.includes('plaats') || key.includes('route')) {
    return 'location';
  }
  return key;
}

function detectHeaderRow(raw: any[][]): { headers: (HeaderKey | string)[]; startIndex: number } {
  if (!raw || raw.length === 0) return { headers: [], startIndex: 1 };
  const required = new Set<HeaderKey>(['license_plate', 'transaction_date', 'amount']);
  let bestIdx = 0;
  let bestHeaders: (HeaderKey | string)[] = (raw[0] as any[]).map(normalizeHeader);
  let bestScore = bestHeaders.filter((h) => required.has(h as HeaderKey)).length;
  const limit = Math.min(raw.length, 50);
  for (let i = 0; i < limit; i++) {
    const headers = (raw[i] as any[]).map(normalizeHeader);
    const score = headers.filter((h) => required.has(h as HeaderKey)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
      bestHeaders = headers;
    }
  }
  return { headers: bestHeaders, startIndex: bestIdx + 1 };
}

function toIsoDate(v: any): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const date = new Date(Date.UTC(d.y, (d.m || 1) - 1, d.d || 1));
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const s = String(v).trim();
  // dd-MM-yyyy or dd/MM/yyyy or dd.MM.yyyy, optionally with time after
  const m1 = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s+.*)?$/);
  if (m1) {
    const dd = String(Number(m1[1])).padStart(2, '0');
    const mm = String(Number(m1[2])).padStart(2, '0');
    let yyyy = m1[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+.*)?$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function toHHmm(v: any): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    // Excel datetime: if number is large (> 1), it's likely a datetime where fractional part is time
    if (v > 1) {
      // Try parsing as Excel datetime (integer part is date, fractional part is time)
      const dateCode = XLSX.SSF.parse_date_code(v);
      if (dateCode && dateCode.H !== undefined && dateCode.M !== undefined) {
        const hh = Math.floor(dateCode.H || 0);
        const mm = Math.floor(dateCode.M || 0);
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      }
      // Extract fractional part as time
      const fractionalPart = v - Math.floor(v);
      if (fractionalPart > 0) {
        const totalMinutes = Math.round(fractionalPart * 24 * 60);
        const hh = Math.floor(totalMinutes / 60) % 24;
        const mm = totalMinutes % 60;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      }
    }
    // Excel time fraction (0..1) or hours as decimal (e.g. 8.5)
    if (v >= 0 && v < 1) {
      const totalMinutes = Math.round(v * 24 * 60);
      const hh = Math.floor(totalMinutes / 60) % 24;
      const mm = totalMinutes % 60;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    if (v >= 0 && v <= 24) {
      const hh = Math.floor(v);
      const mm = Math.round((v - hh) * 60);
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    return null;
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2}):(\d{2})/);
  if (m1) return `${String(Number(m1[1])).padStart(2, '0')}:${m1[2]}`;
  // "8.5" / "8,5"
  const dec = s.replace(',', '.');
  const asNum = Number(dec);
  if (!Number.isNaN(asNum) && asNum >= 0 && asNum <= 24) {
    const hh = Math.floor(asNum);
    const mm = Math.round((asNum - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return null;
}

function parseMoney(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const cleaned = s.replace(/[€\s]/g, '');
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const n = cleaned.replace(/\./g, '').replace(',', '.');
    const x = Number(n);
    return Number.isNaN(x) ? null : x;
  }
  if (cleaned.includes(',')) {
    const x = Number(cleaned.replace(',', '.'));
    return Number.isNaN(x) ? null : x;
  }
  const x = Number(cleaned);
  return Number.isNaN(x) ? null : x;
}

function parseVat(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (v <= 0) return 0;
    // sometimes stored as 0.21
    if (v > 0 && v <= 1) return Math.round(v * 100);
    return Math.round(v);
  }
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s.replace('%', '').trim();
  const normalized = cleaned.replace(',', '.');
  const num = Number(normalized);
  if (Number.isNaN(num)) return null;
  if (num <= 0) return 0;
  if (num <= 1) return Math.round(num * 100);
  return Math.round(num);
}

function normalizeCountry(v: any): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (/^[A-Z]{2}$/.test(up)) return up;
  // fallback: keep as given (uppercased) for reporting/search
  return up;
}

function normalizePlate(v: any): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  if (!s) return null;
  return s;
}

function getFirstSheetRaw(buffer: ArrayBuffer): any[][] {
  const wb = XLSX.read(buffer, { type: 'array' });
  if (!wb.SheetNames?.length) return [];
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1 }) as any[][];
  return raw || [];
}

export function getExcelHeaderRow(buffer: ArrayBuffer): string[] {
  const raw = getFirstSheetRaw(buffer);
  const headerRow = raw[0] || [];
  return (headerRow as any[]).map((h) => String(h ?? '').trim());
}

function findHeaderIndex(headers: string[], label: string): number {
  const want = String(label || '').trim();
  if (!want) return -1;
  // Prefer exact match first
  const exact = headers.findIndex((h) => String(h || '').trim() === want);
  if (exact !== -1) return exact;
  // Fallback: case-insensitive match
  const low = want.toLowerCase();
  return headers.findIndex((h) => String(h || '').trim().toLowerCase() === low);
}

export function parseTollExcelWithMapping(buffer: ArrayBuffer, mapping: TollColumnMapping): TollTransactionImportRow[] {
  const raw = getFirstSheetRaw(buffer);
  if (!raw?.length) return [];

  const headerRow = raw[0] || [];
  const headerLabels = (headerRow as any[]).map((h) => String(h ?? '').trim());

  const idxPlate = findHeaderIndex(headerLabels, mapping.license_plate);
  const idxDate = findHeaderIndex(headerLabels, mapping.transaction_date);
  const idxAmount = findHeaderIndex(headerLabels, mapping.amount);
  const idxTime = mapping.transaction_time ? findHeaderIndex(headerLabels, mapping.transaction_time) : -1;
  const idxCountry = mapping.country ? findHeaderIndex(headerLabels, mapping.country) : -1;
  const idxVat = mapping.vat_rate ? findHeaderIndex(headerLabels, mapping.vat_rate) : -1;
  const idxLocation = mapping.location ? findHeaderIndex(headerLabels, mapping.location) : -1;

  const missing: string[] = [];
  if (idxPlate === -1) missing.push('license_plate');
  if (idxDate === -1) missing.push('transaction_date');
  if (idxAmount === -1) missing.push('amount');
  if (missing.length) {
    throw new Error(`Missing mapped columns in header row: ${missing.join(', ')}`);
  }

  const out: TollTransactionImportRow[] = [];
  const skippedRows: Array<{ rowIndex: number; reason: string }> = [];
  
  for (let r = 1; r < raw.length; r++) {
    const row = raw[r] || [];
    if (!Array.isArray(row) || row.every((c) => c == null || String(c).trim() === '')) {
      skippedRows.push({ rowIndex: r + 1, reason: 'Empty row' });
      continue;
    }

    const plate = normalizePlate(row[idxPlate]);
    const dateIso = toIsoDate(row[idxDate]);
    const amount = parseMoney(row[idxAmount]);
    
    // Try to extract time from date column if it contains datetime
    let time = idxTime !== -1 ? toHHmm(row[idxTime]) ?? null : null;
    
    // If time is not explicitly mapped, try to extract it from the date column
    if (!time && idxDate !== -1) {
      const dateValue = row[idxDate];
      if (dateValue != null) {
        const dateStr = String(dateValue);
        // Check if date string contains time (e.g., "2026-01-07 11:19:24" or Excel datetime)
        const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
        if (timeMatch) {
          time = `${String(Number(timeMatch[1])).padStart(2, '0')}:${timeMatch[2]}`;
        } else if (typeof dateValue === 'number') {
          // Excel datetime: integer part is date, fractional part is time
          const timeFromExcel = toHHmm(dateValue);
          if (timeFromExcel && timeFromExcel !== '00:00') {
            time = timeFromExcel;
          }
        }
      }
    }
    
    // Default to '00:00' only if we really can't find a time
    const finalTime = time ?? '00:00';
    
    const country = idxCountry !== -1 ? normalizeCountry(row[idxCountry]) : null;
    const vat_rate = idxVat !== -1 ? (parseVat(row[idxVat]) ?? 21) : 21;
    const location = idxLocation !== -1 && row[idxLocation] != null ? String(row[idxLocation]).trim() : null;

    if (!plate || !dateIso || amount == null) {
      const reasons: string[] = [];
      if (!plate) reasons.push('missing plate');
      if (!dateIso) reasons.push('missing/invalid date');
      if (amount == null) reasons.push('missing/invalid amount');
      skippedRows.push({ rowIndex: r + 1, reason: reasons.join(', ') });
      continue;
    }

    out.push({
      license_plate: plate,
      transaction_date: dateIso,
      transaction_time: finalTime, // Always use finalTime, never null
      amount: Math.round((Number(amount) + Number.EPSILON) * 100) / 100,
      vat_rate,
      country,
      location: location || null,
    });
  }

  // Log skipped rows for debugging
  if (skippedRows.length > 0) {
    console.log('[TOLL PARSE] Skipped rows:', skippedRows);
  }

  return out;
}

export function parseTollExcel(buffer: ArrayBuffer): TollTransactionImportRow[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  if (!wb.SheetNames?.length) return [];

  // Choose the sheet with most data
  let bestSheet = wb.SheetNames[0];
  let bestRows = 0;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });
    if (Array.isArray(raw) && raw.length > bestRows) {
      bestRows = raw.length;
      bestSheet = sheetName;
    }
  }

  const ws = wb.Sheets[bestSheet];
  const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1 }) as any[][];
  if (!raw?.length) return [];

  const { headers, startIndex } = detectHeaderRow(raw);
  const idx: Partial<Record<HeaderKey, number>> = {};
  headers.forEach((h, i) => {
    if (h === 'license_plate') idx.license_plate = i;
    if (h === 'transaction_date') idx.transaction_date = i;
    if (h === 'transaction_time') idx.transaction_time = i;
    if (h === 'amount') idx.amount = i;
    if (h === 'vat_rate') idx.vat_rate = i;
    if (h === 'country') idx.country = i;
    if (h === 'location') idx.location = i;
  });

  const out: TollTransactionImportRow[] = [];
  for (let r = startIndex; r < raw.length; r++) {
    const row = raw[r] || [];
    if (!Array.isArray(row) || row.every((c) => c == null || String(c).trim() === '')) continue;

    const plate = normalizePlate(row[idx.license_plate ?? -1]);
    const dateIso = toIsoDate(row[idx.transaction_date ?? -1]);
    const amount = parseMoney(row[idx.amount ?? -1]);
    
    // Try to extract time from date column if it contains datetime
    let time = idx.transaction_time != null ? toHHmm(row[idx.transaction_time]) ?? null : null;
    
    // If time is not explicitly mapped, try to extract it from the date column
    if (!time && idx.transaction_date != null) {
      const dateValue = row[idx.transaction_date];
      if (dateValue != null) {
        const dateStr = String(dateValue);
        // Check if date string contains time (e.g., "2026-01-07 11:19:24" or Excel datetime)
        const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
        if (timeMatch) {
          time = `${String(Number(timeMatch[1])).padStart(2, '0')}:${timeMatch[2]}`;
        } else if (typeof dateValue === 'number') {
          // Excel datetime: integer part is date, fractional part is time
          const timeFromExcel = toHHmm(dateValue);
          if (timeFromExcel && timeFromExcel !== '00:00') {
            time = timeFromExcel;
          }
        }
      }
    }
    
    // Default to '00:00' only if we really can't find a time
    const finalTime = time ?? '00:00';
    
    const country = normalizeCountry(row[idx.country ?? -1]);
    const vat_rate = idx.vat_rate != null ? (parseVat(row[idx.vat_rate]) ?? 21) : 21;
    const location = row[idx.location ?? -1] != null ? String(row[idx.location ?? -1]).trim() : null;

    if (!plate || !dateIso || amount == null) continue;

    out.push({
      license_plate: plate,
      transaction_date: dateIso,
      transaction_time: finalTime,
      amount: Math.round((Number(amount) + Number.EPSILON) * 100) / 100,
      vat_rate,
      country,
      location: location || null,
    });
  }

  return out;
}

