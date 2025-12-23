"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import type { TollEntry, Vehicle } from "@/lib/types";
import { getISOWeek, getYear, format } from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronRight, ChevronDown, Trash2 } from "lucide-react";

type ParsedRow = {
  country: string;
  licensePlate: string;
  usageDate: string; // ISO yyyy-MM-dd
  usageTime?: string; // HH:mm (optioneel)
  amount: number;
  vatRate: number;
  weekId: string;
  source?: string;
};

type ColumnMapping = {
  usageDate?: string;
  usageTime?: string;
  licensePlate?: string;
  country?: string;
  amount?: string;
  vatRate?: string;
};

// Helper type for tri-state checkbox handling in JSX
type CheckedTri = boolean | "indeterminate";
const REQUIRED_MAPPING_FIELDS: (keyof ColumnMapping)[] = ["usageDate", "licensePlate", "country", "amount"];
const SELECT_NONE_VALUE = "__none__";
const mappingFieldMeta: Array<{ key: keyof ColumnMapping; label: string; hint: string; required?: boolean }> = [
  { key: "usageDate", label: "Datum gebruik", required: true, hint: "Kolom met de datum (bijv. 12-12-2025)." },
  { key: "usageTime", label: "Tijdstip", hint: "Optioneel: tijdstip zoals 08:30 of 8.5." },
  { key: "licensePlate", label: "Kenteken", required: true, hint: "Kolom met het kenteken." },
  { key: "country", label: "Land", required: true, hint: "Kolom met land/regio (bijv. BE, Duitsland)." },
  { key: "amount", label: "Bedrag (excl. btw)", required: true, hint: "Tolbedrag exclusief btw." },
  { key: "vatRate", label: "BTW %", hint: "BTW percentage. Laat leeg om per land de standaard te gebruiken." },
];

type ColumnOption = { value: string; label: string };

const columnValueFromIndex = (idx: number) => `col-${idx}`;
const columnIndexFromValue = (value?: string): number | undefined => {
  if (!value || value === SELECT_NONE_VALUE) return undefined;
  if (!value.startsWith("col-")) return undefined;
  const parsed = Number(value.slice(4));
  return Number.isNaN(parsed) ? undefined : parsed;
};

function toIsoDate(v: any): string | null {
  if (v == null || v === "") return null;
  // XLSX may give numbers for Excel dates
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const date = new Date(Date.UTC(d.y, (d.m || 1) - 1, d.d || 1));
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof v === "string") {
    // Try common formats: dd-MM-yyyy, yyyy-MM-dd
    const trimmed = v.trim();
    // Accept 1-2 digit day/month and 2-4 digit year, with - / . separators, optional time part
    const m1 = trimmed.match(/^(let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));d{1,2})[let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));-let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));/.](let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));d{1,2})[let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));-let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));/.]?(let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));d{2,4})(?:let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));s+.*)?$/);
    if (m1) {
      let [_, dd, mm, yyyy] = m1;
      if (yyyy.length === 2) {
        // Assume 20xx for 2-digit years
        yyyy = `20${yyyy}`;
      }
      const dd2 = String(Number(dd)).padStart(2, '0');
      const mm2 = String(Number(mm)).padStart(2, '0');
      return `${yyyy}-${mm2}-${dd2}`;
    }
    const m2 = trimmed.match(/^(let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));d{4})-(let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));d{2})-(let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));d{2})$/);
    if (m2) return trimmed;
    // Fallback to Date parsing
    const dt = new Date(trimmed);
    if (!isNaN(dt.getTime())) {
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return null;
}

function weekIdFromIso(dateIso: string): string {
  const d = new Date(dateIso);
  const y = getYear(d);
  const w = getISOWeek(d);
  return `${y}-${w}`;
}

function formatInvoiceReference(reference?: string | null): string {
  if (!reference) return '-';
  // Extract week, year, and license plate from reference
  // Format: "Week xx - yyyy (kenteken)" -> "Week xx - yyyy - kenteken"
  const weekMatch = reference.match(/week\s+(\d{1,2})\s*[-/]\s*(\d{4})/i);
  const plateMatch = reference.match(/\(([A-Z0-9-]{5,})\)/i);
  
  if (weekMatch && plateMatch) {
    const week = weekMatch[1].padStart(2, '0');
    const year = weekMatch[2];
    const plate = plateMatch[1].toUpperCase();
    return `Week ${week} - ${year} - ${plate}`;
  }
  
  // Fallback: return original reference if format doesn't match
  return reference;
}

function buildEntryGroupMeta(entry: TollEntry) {
  const d = new Date(entry.usageDate);
  const weekId = entry.weekId || `${getYear(d)}-${getISOWeek(d)}`;
  const day = format(d, 'EEEE', { locale: nl });
  const dateIso = entry.usageDate;
  return {
    weekId,
    day,
    dateIso,
    key: `${weekId}|${day}|${entry.licensePlate}|${entry.country}|${entry.vatRate}`,
  };
}

function normalizeHeader(h: string): string {
  const key = (h || '').toString().trim().toLowerCase();
  // Fuzzy contains to be robust against varied exports
  if (key.includes('serviceland') || key.includes('land') || key.includes('country')) return 'country';
  if (key.includes('nummerplaat') || key.includes('kenteken') || key.includes('license') || key.includes('plate')) return 'licensePlate';
  if (key.includes('tijd') || key.includes('time') || key.includes('hour')) return 'usageTime';
  if (key.includes('datum gebruik') || key.includes('datum') || key.includes('date') || key.includes('gebruik')) return 'usageDate';
  if (key.includes('berekend bedrag') || key.includes('exclusief') || key.includes('ex btw') || key.includes('bedrag') || key.includes('ex') || key.includes('excl') || key.includes('amount')) return 'amount';
  if (key.includes('btw%') || key.includes('btw %') || key.includes('btw') || key.includes('vat')) return 'vatRate';
  return key;
}

// Map "serviceland" of regio-omschrijvingen naar landcodes (BE, DE, LU, FR, etc.)
function mapServiceLandToCountryCode(v: string): string {
  if (!v) return '';
  const s = v.toString().trim().toLowerCase();
  // Substring checks to handle vendor-specific labels
  if (s === 'be' || s.includes('belg') || s.includes('viapass') || s.includes('vlaander') || s.includes('walloni') || s.includes('brussel') || s.includes('brux')) return 'BE';
  if (s === 'de' || s.includes('duits') || s.includes('deutsch') || s.includes('german') || s.includes('toll collect')) return 'DE';
  if (s === 'fr' || s.includes('frankrijk') || s.includes('france') || s.includes('telepeage') || s.includes('tÃ©lÃ©pÃ©age')) return 'FR';
  if (s === 'lu' || s.includes('luxem')) return 'LU';
  if (s === 'nl' || s.includes('nederl') || s.includes('nether')) return 'NL';
  if (s === 'at' || s.includes('oostenrijk') || s.includes('osterreich') || s.includes('Ã¶sterreich') || s.includes('austria')) return 'AT';
  if (s === 'ch' || s.includes('zwitser') || s.includes('schweiz') || s.includes('suisse') || s.includes('switzerland')) return 'CH';
  if (s === 'it' || s.includes('ital')) return 'IT';
  if (s === 'es' || s.includes('spanj') || s.includes('spain')) return 'ES';
  if (s === 'pl' || s.includes('polen') || s.includes('poland')) return 'PL';
  if (s === 'cz' || s.includes('tsjech') || s.includes('czech')) return 'CZ';
  // fallback: if it's already a 2-letter code
  if (/^[a-z]{2}$/.test(s)) return s.toUpperCase();
  return s.toUpperCase();
}

function detectHeaderRow(raw: any[][]): { headers: string[]; startIndex: number } {
  if (!raw || raw.length === 0) return { headers: [], startIndex: 1 };
  // Scan first 10 rows to find a header row containing at least 2 of required keys
  const required = new Set(['country','licensePlate','usageDate']);
  let bestIdx = 0;
  let bestHeaders: string[] = (raw[0] as any[]).map((h) => String(h || '')).map(normalizeHeader);
  let bestScore = bestHeaders.filter(h => required.has(h)).length;
  const limit = Math.min(raw.length, 50);
  for (let i = 0; i < limit; i++) {
    const row = raw[i] as any[];
    if (!Array.isArray(row)) continue;
    const headers = row.map((h) => String(h || '')).map(normalizeHeader);
    const score = headers.filter(h => required.has(h)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
      bestHeaders = headers;
    }
  }
  return { headers: bestHeaders, startIndex: bestIdx + 1 };
}

function parseMoney(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  // Remove currency and spaces
  const cleaned = s.replace(/[Ã¢â€šÂ¬let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));s]/g, '');
  // If both dot and comma present, assume dot as thousand and comma as decimal
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const n = cleaned.replace(/let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));./g, '').replace(',', '.');
    const x = Number(n);
    return isNaN(x) ? null : x;
  }
  // If only comma present, treat as decimal comma
  if (cleaned.includes(',')) {
    const n = cleaned.replace(',', '.');
    const x = Number(n);
    return isNaN(x) ? null : x;
  }
  const x = Number(cleaned);
  return isNaN(x) ? null : x;
}

// Robust VAT parser: supports 21, "21%", 0.21, "0,21", etc.
function parseVat(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (v <= 0) return 0;
    if (v > 0 && v <= 1) return Math.round(v * 100);
    return Math.round(v);
  }
  const s = String(v).trim();
  const digits = s.replace(/[^0-9,let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));.let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));-]/g, '');
  if (!digits) return null;
  const normalized = digits.includes(',') && digits.includes('.')
    ? digits.replace(/let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));./g, '').replace(',', '.')
    : digits.replace(',', '.');
  const num = Number(normalized);
  if (isNaN(num)) return null;
  if (num <= 0) return 0;
  if (num <= 1) return Math.round(num * 100);
  return Math.round(num);
}

function defaultVatForCountry(countryCode: string): number {
  switch ((countryCode || '').toUpperCase()) {
    case 'NL': return 21;
    case 'BE': return 21; // Vlaanderen/WalloniÃ«
    case 'DE': return 19;
    case 'FR': return 20;
    case 'LU': return 17;
    case 'AT': return 20;
    case 'IT': return 22;
    case 'ES': return 21;
    case 'PL': return 23;
    case 'CZ': return 21;
    case 'CH': return 0;
    default: return 21;
  }
}

function inferColumns(rows: any[][]): { dateCol?: number; plateCol?: number; countryCol?: number; amountCol?: number; vatCol?: number } {
  const sampleRows = rows.slice(0, 200);
  const colCount = sampleRows.reduce((m, r) => Math.max(m, r?.length || 0), 0);
  const scoreDate: number[] = Array(colCount).fill(0);
  const scorePlate: number[] = Array(colCount).fill(0);
  const scoreCountry: number[] = Array(colCount).fill(0);
  const scoreAmount: number[] = Array(colCount).fill(0);
  const scoreVat: number[] = Array(colCount).fill(0);

  const plateRegex = /^[A-Za-z0-9let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));-let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));s]{4,12}$/;
  const countryRegex = /^[A-Za-z]{2,}$/; // codes of namen

  for (const r of sampleRows) {
    for (let c = 0; c < colCount; c++) {
      const v = r?.[c];
      if (v == null || v === '') continue;
      // Date score
      const iso = v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}` : toIsoDate(v);
      if (iso) scoreDate[c]++;
      // Plate score
      if (typeof v === 'string' && plateRegex.test(v.trim())) scorePlate[c]++;
      // Country score
      if (typeof v === 'string' && countryRegex.test(v.trim()) && v.trim().length <= 15) scoreCountry[c]++;
      // Amount score
      const money = parseMoney(v);
      if (money !== null) scoreAmount[c]++;
      // VAT score: percentage 0..100
      const maybeVat = parseMoney(v);
      if (maybeVat !== null && maybeVat >= 0 && maybeVat <= 100) scoreVat[c]++;
    }
  }

  const pick = (scores: number[]) => {
    let bestI = -1, bestV = -1;
    for (let i = 0; i < scores.length; i++) if (scores[i] > bestV) { bestV = scores[i]; bestI = i; }
    return bestI >= 0 && bestV > 0 ? bestI : undefined;
  };

  // Ensure columns are distinct where possible
  const dateCol = pick(scoreDate);
  if (dateCol !== undefined) { scorePlate[dateCol]=scoreCountry[dateCol]=scoreAmount[dateCol]=scoreVat[dateCol]= -1; }
  const plateCol = pick(scorePlate);
  if (plateCol !== undefined) { scoreCountry[plateCol]=scoreAmount[plateCol]=scoreVat[plateCol]= -1; }
  const countryCol = pick(scoreCountry);
  if (countryCol !== undefined) { scoreAmount[countryCol]=scoreVat[countryCol]= -1; }
  const amountCol = pick(scoreAmount);
  if (amountCol !== undefined) { scoreVat[amountCol]= -1; }
  const vatCol = pick(scoreVat);

  return { dateCol, plateCol, countryCol, amountCol, vatCol };
}

// Vast kolommen-profiel (zoals aangegeven):
// A = Serviceland (Land), D = Nummerplaat (Kenteken), L = Datum gebruik (Datum),
// X = Berekend bedrag excl. BTW (Bedrag), Z = BTW% (BTW)
// Indexen 0-based: A=0, D=3, L=11, X=23, Z=25
function parseWithFixedColumns(rowsRaw: any[][], fileName: string, sheetName: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const row of rowsRaw) {
    if (!Array.isArray(row) || row.length < 26) continue;
    const rawCountry = row[0];
    const rawPlate = row[3];
    const rawDate = row[11];
    const rawAmount = row[23];
    const rawVat = row[25];

    const iso = rawDate instanceof Date
      ? `${rawDate.getFullYear()}-${String(rawDate.getMonth()+1).padStart(2,'0')}-${String(rawDate.getDate()).padStart(2,'0')}`
      : toIsoDate(rawDate);
    if (!iso) continue;

    const plate = String(rawPlate || '').trim().toUpperCase();
    const countryCode = mapServiceLandToCountryCode(String(rawCountry || ''));
    if (!plate || !countryCode) continue;

    const amountNum = parseMoney(rawAmount) ?? 0;
    const vatParsed = parseVat(rawVat);
    const vatNum = vatParsed == null ? defaultVatForCountry(countryCode) : vatParsed;

    rows.push({
      country: countryCode,
      licensePlate: plate,
      usageDate: iso,
      amount: amountNum,
      vatRate: vatNum,
      weekId: weekIdFromIso(iso),
      source: `${fileName} (${sheetName})`,
    });
  }
  return rows;
}

function buildColumnOptions(headerCells: any[]): ColumnOption[] {
  return headerCells.map((cell, idx) => {
    const label = (cell ?? "").toString().trim();
    return { value: columnValueFromIndex(idx), label: label.length > 0 ? label : `Kolom ${idx + 1}` };
  });
}

function buildAutoMapping(normalizedHeaders: string[], rows: any[][]): ColumnMapping {
  const mapping: ColumnMapping = {};
  normalizedHeaders.forEach((header, idx) => {
    const value = columnValueFromIndex(idx);
    switch (header) {
      case "usageDate":
        if (!mapping.usageDate) mapping.usageDate = value;
        break;
      case "usageTime":
        if (!mapping.usageTime) mapping.usageTime = value;
        break;
      case "licensePlate":
        if (!mapping.licensePlate) mapping.licensePlate = value;
        break;
      case "country":
        if (!mapping.country) mapping.country = value;
        break;
      case "amount":
        if (!mapping.amount) mapping.amount = value;
        break;
      case "vatRate":
        if (!mapping.vatRate) mapping.vatRate = value;
        break;
    }
  });
  if (rows.length > 0) {
    const inferred = inferColumns(rows);
    if (!mapping.usageDate && inferred.dateCol !== undefined) mapping.usageDate = columnValueFromIndex(inferred.dateCol);
    if (!mapping.licensePlate && inferred.plateCol !== undefined) mapping.licensePlate = columnValueFromIndex(inferred.plateCol);
    if (!mapping.country && inferred.countryCol !== undefined) mapping.country = columnValueFromIndex(inferred.countryCol);
    if (!mapping.amount && inferred.amountCol !== undefined) mapping.amount = columnValueFromIndex(inferred.amountCol);
    if (!mapping.vatRate && inferred.vatCol !== undefined) mapping.vatRate = columnValueFromIndex(inferred.vatCol);
  }
  return mapping;
}

const formatTimePart = (value: number) => String(Math.max(0, value)).padStart(2, "0");

function secondsToTimeString(totalSeconds: number): string {
  const normalized = ((totalSeconds % 86400) + 86400) % 86400;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const seconds = normalized % 60;
  return `${formatTimePart(hours)}:${formatTimePart(minutes)}:${formatTimePart(seconds)}`;
}

function parseUsageTime(value: any): string | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) {
    return secondsToTimeString(value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds());
  }
  if (typeof value === "number") {
    const fraction = ((value % 1) + 1) % 1;
    return secondsToTimeString(Math.round(fraction * 24 * 60 * 60));
  }
  const text = String(value).trim();
  const match = text.match(/(\d{1,2}:\d{2}:\d{2})/);
  if (!match) return undefined;
  const [hh, mm, ss] = match[1].split(":").map((part) => Number(part));
  if ([hh, mm, ss].some((n) => Number.isNaN(n))) return undefined;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return undefined;
  return `${formatTimePart(hh)}:${formatTimePart(mm)}:${formatTimePart(ss)}`;
}

function transformRowsWithMapping(rows: any[][], mapping: ColumnMapping, fileName: string, sheetName: string): ParsedRow[] {
  const idxDate = columnIndexFromValue(mapping.usageDate);
  const idxPlate = columnIndexFromValue(mapping.licensePlate);
  const idxCountry = columnIndexFromValue(mapping.country);
  const idxAmount = columnIndexFromValue(mapping.amount);
  if ([idxDate, idxPlate, idxCountry, idxAmount].some((idx) => idx === undefined)) return [];
  const idxVat = columnIndexFromValue(mapping.vatRate);
  const idxTime = columnIndexFromValue(mapping.usageTime);
  const sourceLabel = fileName ? (sheetName ? `${fileName} (${sheetName})` : fileName) : sheetName || undefined;

  const result: ParsedRow[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const rawDate = idxDate !== undefined ? row[idxDate] : undefined;
    const iso = rawDate instanceof Date
      ? `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, "0")}-${String(rawDate.getDate()).padStart(2, "0")}`
      : toIsoDate(rawDate);
    if (!iso) continue;
    const rawPlate = idxPlate !== undefined ? row[idxPlate] : undefined;
    const plate = String(rawPlate ?? "").trim().toUpperCase();
    if (!plate) continue;
    const rawCountry = idxCountry !== undefined ? row[idxCountry] : undefined;
    const country = mapServiceLandToCountryCode(String(rawCountry ?? "").trim());
    if (!country) continue;
    const rawAmount = idxAmount !== undefined ? row[idxAmount] : undefined;
    const amountNum = parseMoney(rawAmount);
    if (amountNum == null) continue;
    const rawVat = idxVat !== undefined ? row[idxVat] : undefined;
    const vatParsed = rawVat == null ? null : parseVat(rawVat);
    const vatRate = vatParsed == null ? defaultVatForCountry(country) : vatParsed;
    const usageTime = idxTime !== undefined ? parseUsageTime(row[idxTime]) : undefined;
    result.push({
      country,
      licensePlate: plate,
      usageDate: iso,
      usageTime,
      amount: amountNum,
      vatRate,
      weekId: weekIdFromIso(iso),
      source: sourceLabel,
    });
  }
  return result;
}

export default function TollOverviewPage() {
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [columnOptions, setColumnOptions] = useState<ColumnOption[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [rawSheetRows, setRawSheetRows] = useState<any[][]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState<string>("");
  const [normalizedHeaders, setNormalizedHeaders] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [filterWeek, setFilterWeek] = useState<string>("");
  const [filterPlate, setFilterPlate] = useState<string>("");
  const [entries, setEntries] = useState<TollEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [invoiceMap, setInvoiceMap] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'raw' | 'summary'>("raw");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const entryMetaCache = useMemo(() => new Map<string, ReturnType<typeof buildEntryGroupMeta>>(), []);
  const [invoices, setInvoices] = useState<Array<{ id: string; invoice_number: string; reference?: string; status?: string; created_at?: string }>>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const parseInvoiceReference = (value?: string | null) => {
    if (!value) return null;
    const match = value.match(/week\s+(\d{1,2})\s*[-/]\s*(\d{4}).*?([A-Za-z0-9-]{5,})\)?$/i);
    if (!match) return null;
    const [, weekPart, yearPart, platePart] = match;
    const week = weekPart.padStart(2, "0");
    return { weekId: `${yearPart}-${week}`, plate: platePart.toUpperCase() };
  };

  const findInvoiceIdForGroup = (weekId: string, plate: string) => {
    if (!weekId || !plate) return undefined;
    const [year, weekPart] = weekId.split("-");
    if (!year || !weekPart) return undefined;
    const normalizedWeekId = `${year}-${weekPart.padStart(2, "0")}`;
    const normalizedPlate = plate.toUpperCase();
    const invoice = invoices.find((inv) => {
      const context = parseInvoiceReference(inv.reference || inv.invoice_number);
      return context && context.weekId === normalizedWeekId && context.plate === normalizedPlate;
    });
    return invoice?.id;
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value ?? 0);

  useEffect(() => {
    let active = true;
    supabase
      .from("vehicles")
      .select("*")
      .order("license_plate")
      .then(({ data }) => {
        if (!active) return;
        const arr = (data || []).map((r: any) => ({
          id: r.id,
          licensePlate: r.license_plate,
          make: r.make,
          model: r.model,
          status: r.status,
          createdAt: r.created_at,
          lastKnownMileage: r.last_known_mileage || undefined,
        })) as Vehicle[];
        setVehicles(arr);
      });
    return () => {
      active = false;
    };
  }, []);

  // Fetch concept/draft invoices for linking
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, reference, status, created_at')
        .eq('status', 'concept')
        .order('created_at', { ascending: false })
        .limit(200);
      if (!mounted) return;
      setInvoices((data || []) as any);
    })();
    return () => { mounted = false; };
  }, []);

  const recentWeeks = useMemo(() => {
    const now = new Date();
    const items: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i * 7);
      items.push(`${getYear(d)}-${getISOWeek(d)}`);
    }
    return Array.from(new Set(items));
  }, []);

  useEffect(() => {
    if (rawSheetRows.length === 0) {
      setParsed([]);
      return;
    }
    const ready = REQUIRED_MAPPING_FIELDS.every((field) => {
      const value = columnMapping[field];
      return value && value !== SELECT_NONE_VALUE;
    });
    if (!ready) {
      setParsed([]);
      return;
    }
    const next = transformRowsWithMapping(rawSheetRows, columnMapping, fileName, selectedSheetName);
    setParsed(next);
  }, [rawSheetRows, columnMapping, fileName, selectedSheetName]);

  const handleFile = async (file: File) => {
    setParsed([]);
    setColumnOptions([]);
    setColumnMapping({});
    setRawSheetRows([]);
    setNormalizedHeaders([]);
    setSelectedSheetName("");
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      let best: {
        sheet: string;
        rows: any[][];
        normalizedHeaders: string[];
        options: ColumnOption[];
        mapping: ColumnMapping;
        preview: ParsedRow[];
        rowCount: number;
      } | null = null;

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });
        if (!raw || raw.length === 0) continue;
        const { headers, startIndex } = detectHeaderRow(raw as any[][]);
        const headerRow = (raw[startIndex - 1] as any[]) || [];
        const dataRows = (raw.slice(startIndex) as any[][]).filter(
          (row) => Array.isArray(row) && row.some((cell) => cell !== undefined && cell !== null && cell !== "")
        );
        if (headerRow.length === 0 && dataRows.length === 0) continue;

        let columnCount = headerRow.length;
        for (const row of dataRows) columnCount = Math.max(columnCount, row?.length || 0);
        const headerCells = Array.from({ length: columnCount }, (_, idx) => headerRow[idx] ?? "");
        const normalized = headerCells.map((cell, idx) => headers[idx] ?? normalizeHeader(String(cell || "")));
        const options = buildColumnOptions(headerCells);
        const mapping = buildAutoMapping(normalized, dataRows);
        const preview = transformRowsWithMapping(dataRows, mapping, file.name, sheetName);

        const candidate = {
          sheet: sheetName,
          rows: dataRows,
          normalizedHeaders: normalized,
          options,
          mapping,
          preview,
          rowCount: dataRows.length,
        };
        if (
          !best ||
          preview.length > best.preview.length ||
          (preview.length === best.preview.length && dataRows.length > best.rowCount)
        ) {
          best = candidate;
        }
      }

      if (!best) {
        toast({
          variant: "destructive",
          title: "Geen tabbladen gevonden",
          description: "Het bestand bevat geen herkenbare data.",
        });
        return;
      }

      setSelectedSheetName(best.sheet);
      setColumnOptions(best.options);
      setNormalizedHeaders(best.normalizedHeaders);
      setColumnMapping(best.mapping);
      setRawSheetRows(best.rows);
      setParsed(best.preview);

      if (best.preview.length === 0) {
        toast({
          title: "Kolommen koppelen",
          description: "Geen regels herkend. Koppel de kolommen handmatig om een preview te zien.",
        });
      } else {
        toast({ title: `Voorbeeld geladen (${best.preview.length} regels)` });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Fout bij lezen Excel" });
    }
  };

  const handleMappingChange = (field: keyof ColumnMapping, value: string) => {
    setColumnMapping((prev) => {
      if (value === SELECT_NONE_VALUE) {
        if (!(field in prev)) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      }
      if (prev[field] === value) return prev;
      return { ...prev, [field]: value };
    });
  };

  const handleAutoDetectMapping = () => {
    if (normalizedHeaders.length === 0 || rawSheetRows.length === 0) return;
    setColumnMapping(buildAutoMapping(normalizedHeaders, rawSheetRows));
  };

  const handleImport = async () => {
    if (parsed.length === 0) return;
    setIsImporting(true);
    try {
      // Check for duplicates: fetch ALL existing entries (including those already added to invoices)
      // We check on rule level: license_plate + usage_date + country + amount + vat_rate
      // This prevents importing duplicates regardless of whether they're already applied to an invoice
      const { data: existingEntries, error: fetchError } = await supabase
        .from("toll_entries")
        .select("license_plate, usage_date, usage_time, country, amount, vat_rate, applied_invoice_id");
      
      if (fetchError) {
        console.error("Error fetching existing entries:", fetchError);
        // Continue anyway, but log the error
      }
      
      // Create a Set of existing entry keys for fast lookup
      // Include both entries with and without applied_invoice_id
      const existingKeys = new Set<string>();
      const appliedKeys = new Set<string>(); // Track which ones are already applied to invoices
      
      (existingEntries || []).forEach((entry: any) => {
        const key = `${entry.license_plate}|${entry.usage_date}|${entry.usage_time || ""}|${entry.country}|${entry.amount}|${entry.vat_rate}`;
        existingKeys.add(key);
        if (entry.applied_invoice_id) {
          appliedKeys.add(key);
        }
      });
      
      // Filter out duplicates from parsed rows
      const rowsToImport: ParsedRow[] = [];
      const duplicates: ParsedRow[] = [];
      const duplicatesAlreadyApplied: ParsedRow[] = [];
      
      for (const r of parsed) {
        const key = `${r.licensePlate}|${r.usageDate}|${r.usageTime || ""}|${r.country}|${r.amount}|${r.vatRate}`;
        if (existingKeys.has(key)) {
          if (appliedKeys.has(key)) {
            duplicatesAlreadyApplied.push(r);
          } else {
            duplicates.push(r);
          }
        } else {
          rowsToImport.push(r);
          // Add to existingKeys to prevent duplicates within the same import batch
          existingKeys.add(key);
        }
      }
      
      // Show warning if duplicates were found
      if (duplicates.length > 0 || duplicatesAlreadyApplied.length > 0) {
        const totalDuplicates = duplicates.length + duplicatesAlreadyApplied.length;
        const duplicateMessage = duplicatesAlreadyApplied.length > 0 
          ? `${totalDuplicates} regels zijn overgeslagen: ${duplicatesAlreadyApplied.length} zijn al toegevoegd aan een factuur, ${duplicates.length} bestaan al in de database.`
          : `${duplicates.length} regels zijn overgeslagen omdat ze al bestaan in de database.`;
        
        toast({
          variant: "destructive",
          title: "Dubbele regels gedetecteerd",
          description: `${duplicateMessage} ${rowsToImport.length} nieuwe regels worden geïmporteerd.`,
          duration: 7000,
        });
      }
      
      // If no new rows to import, return early
      if (rowsToImport.length === 0) {
        const message = duplicatesAlreadyApplied.length > 0
          ? `Alle regels zijn al aanwezig. ${duplicatesAlreadyApplied.length} regels zijn reeds toegevoegd aan een factuur.`
          : "Alle regels zijn al aanwezig in de database.";
        toast({
          title: "Geen nieuwe regels",
          description: message,
        });
        setParsed([]);
        return;
      }
      
      // Batch insert in chunks to avoid payload limits
      const chunkSize = 500;
      for (let i = 0; i < rowsToImport.length; i += chunkSize) {
        const chunk = rowsToImport.slice(i, i + chunkSize);
        const rows = chunk.map((r) => ({
          country: r.country,
          license_plate: r.licensePlate,
          usage_date: r.usageDate,
          usage_time: r.usageTime || null,
          amount: r.amount,
          vat_rate: r.vatRate,
          week_id: r.weekId,
          source: r.source || null,
        }));
        const { error } = await supabase.from("toll_entries").insert(rows);
        if (error) throw error;
      }
      await fetchEntries();
      const duplicateInfo = duplicatesAlreadyApplied.length > 0
        ? `${duplicatesAlreadyApplied.length} al toegevoegd aan factuur, ${duplicates.length} duplicaten`
        : duplicates.length > 0 
          ? `${duplicates.length} duplicaten`
          : '';
      toast({ 
        title: "Tolregels geïmporteerd", 
        description: `${rowsToImport.length} nieuwe regels toegevoegd${duplicateInfo ? `, ${duplicateInfo} overgeslagen` : ''}` 
      });
      setParsed([]);
      setColumnOptions([]);
      setColumnMapping({});
      setRawSheetRows([]);
      setNormalizedHeaders([]);
      setSelectedSheetName("");
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Import mislukt", description: e.message || "Onbekende fout" });
    } finally {
      setIsImporting(false);
    }
  };

  const fetchEntries = async () => {
    setLoadingEntries(true);
    try {
      let query = supabase.from("toll_entries").select("*").order("usage_date", { ascending: false }).limit(1000);
      if (filterWeek) query = query.eq("week_id", filterWeek);
      if (filterPlate) query = query.eq("license_plate", filterPlate);
      const { data, error } = await query;
      if (error) throw error;
      const mapped = (data || []).map((r: any) => ({
        id: r.id,
        country: r.country,
        licensePlate: r.license_plate,
        usageDate: r.usage_date,
        usageTime: r.usage_time || undefined,
        amount: Number(r.amount) || 0,
        vatRate: (Number.isFinite(Number(r.vat_rate)) ? Number(r.vat_rate) : 21),
        weekId: r.week_id || undefined,
        source: r.source || undefined,
        appliedInvoiceId: r.applied_invoice_id ? String(r.applied_invoice_id) : null,
        appliedAt: r.applied_at ? String(r.applied_at) : null,
        createdAt: r.created_at || undefined,
      })) as TollEntry[];
      setEntries(mapped);
    } catch (e: any) {
      // Toon duidelijkere foutmelding in UI en console
      const details = { code: e?.code, message: e?.message, details: e?.details, hint: e?.hint, status: e?.status, name: e?.name };
      const code = e?.code || e?.details || e?.message || e;
      console.error("[Toloverzichten] fetchEntries error:", details);
      // Specifieke hint als de tabel nog niet bestaat (42P01 = undefined_table)
      if (e?.code === '42P01' || String(e)?.includes('toll_entries')) {
        toast({
          variant: 'destructive',
          title: 'Toloverzichten niet geconfigureerd',
          description: 'De database tabel toll_entries lijkt te ontbreken. Voer de Supabase migratie uit om deze pagina te gebruiken.',
          duration: 8000,
        });
      } else {
        toast({ variant: 'destructive', title: 'Ophalen mislukt', description: String(code) });
      }
    } finally {
      setLoadingEntries(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterWeek, filterPlate]);

  const totalAmount = useMemo(() => entries.reduce((acc, e) => acc + e.amount, 0), [entries]);

  const weeklySummaryPending = useMemo(() => {
    const map = new Map<string, { weekId: string; day: string; licensePlate: string; country: string; vatRate: number; total: number; count: number }>();
    // Filter entries that are NOT applied to an invoice (appliedInvoiceId is null or undefined)
    for (const e of entries.filter(x => !x.appliedInvoiceId || x.appliedInvoiceId === null)) {
      const d = new Date(e.usageDate);
      const weekId = e.weekId || `${getYear(d)}-${getISOWeek(d)}`;
      const day = format(d, 'EEEE', { locale: nl });
      const key = `${weekId}|${day}|${e.licensePlate}|${e.country}|${e.vatRate}`;
      const curr = map.get(key);
      if (curr) {
        curr.total += e.amount;
        curr.count += 1;
      } else {
        map.set(key, { weekId, day, licensePlate: e.licensePlate, country: e.country, vatRate: e.vatRate, total: e.amount, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a,b) => b.weekId.localeCompare(a.weekId));
  }, [entries]);

  const weeklySummaryApplied = useMemo(() => {
    const map = new Map<string, { weekId: string; day: string; licensePlate: string; country: string; vatRate: number; total: number; count: number; invoiceIds: string[] }>();
    for (const e of entries.filter(x => !!x.appliedInvoiceId)) {
      const d = new Date(e.usageDate);
      const weekId = e.weekId || `${getYear(d)}-${getISOWeek(d)}`;
      const day = format(d, 'EEEE', { locale: nl });
      const key = `${weekId}|${day}|${e.licensePlate}|${e.country}|${e.vatRate}`;
      const curr = map.get(key);
      if (curr) {
        curr.total += e.amount;
        curr.count += 1;
        if (e.appliedInvoiceId && !curr.invoiceIds.includes(e.appliedInvoiceId)) curr.invoiceIds.push(e.appliedInvoiceId);
      } else {
        map.set(key, { weekId, day, licensePlate: e.licensePlate, country: e.country, vatRate: e.vatRate, total: e.amount, count: 1, invoiceIds: e.appliedInvoiceId ? [e.appliedInvoiceId] : [] });
      }
    }
    return Array.from(map.values()).sort((a,b) => b.weekId.localeCompare(a.weekId));
  }, [entries]);

  const itemsByGroup = useMemo(() => {
    const m = new Map<string, TollEntry[]>();
    for (const e of entries) {
      const d = new Date(e.usageDate);
      const weekId = e.weekId || `${getYear(d)}-${getISOWeek(d)}`;
      const day = format(d, 'EEEE', { locale: nl });
      const key = `${weekId}|${day}|${e.licensePlate}|${e.country}|${e.vatRate}`;
      const arr = m.get(key);
      if (arr) arr.push(e); else m.set(key, [e]);
    }
    return m;
  }, [entries]);

  const itemsByGroupPending = useMemo(() => {
    const m = new Map<string, TollEntry[]>();
    // Filter entries that are NOT applied to an invoice (appliedInvoiceId is null or undefined)
    for (const e of entries.filter(x => !x.appliedInvoiceId || x.appliedInvoiceId === null)) {
      const d = new Date(e.usageDate);
      const weekId = e.weekId || `${getYear(d)}-${getISOWeek(d)}`;
      const day = format(d, 'EEEE', { locale: nl });
      const key = `${weekId}|${day}|${e.licensePlate}|${e.country}|${e.vatRate}`;
      const arr = m.get(key);
      if (arr) arr.push(e); else m.set(key, [e]);
    }
    return m;
  }, [entries]);

  const itemsByGroupApplied = useMemo(() => {
    const m = new Map<string, TollEntry[]>();
    // Filter entries that ARE applied to an invoice (appliedInvoiceId is not null or undefined)
    for (const e of entries.filter(x => x.appliedInvoiceId && x.appliedInvoiceId !== null)) {
      const d = new Date(e.usageDate);
      const weekId = e.weekId || `${getYear(d)}-${getISOWeek(d)}`;
      const day = format(d, 'EEEE', { locale: nl });
      const key = `${weekId}|${day}|${e.licensePlate}|${e.country}|${e.vatRate}`;
      const arr = m.get(key);
      if (arr) arr.push(e); else m.set(key, [e]);
    }
    return m;
  }, [entries]);

  const toggleGroup = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Selection helpers
  const toggleItemSelected = (id: string, checked: boolean | string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked === true || checked === 'indeterminate') next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleGroupSelected = (key: string, checked: boolean | string) => {
    const items = itemsByGroup.get(key) || [];
    const ids = items.map(i => i.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked === true || checked === 'indeterminate') {
        ids.forEach(id => next.add(id));
      } else {
        ids.forEach(id => next.delete(id));
      }
      return next;
    });
  };

  const pendingVisibleIds = useMemo(() => entries.filter(e => !e.appliedInvoiceId || e.appliedInvoiceId === null).map(e => e.id), [entries]);
  const appliedVisibleIds = useMemo(() => entries.filter(e => e.appliedInvoiceId && e.appliedInvoiceId !== null).map(e => e.id), [entries]);
  const pendingAllSelected = useMemo(() => pendingVisibleIds.length > 0 && pendingVisibleIds.every(id => selectedIds.has(id)), [pendingVisibleIds, selectedIds]);
  const pendingSomeSelected = useMemo(() => pendingVisibleIds.some(id => selectedIds.has(id)) && !pendingAllSelected, [pendingVisibleIds, selectedIds, pendingAllSelected]);
  const appliedAllSelected = useMemo(() => appliedVisibleIds.length > 0 && appliedVisibleIds.every(id => selectedIds.has(id)), [appliedVisibleIds, selectedIds]);
  const appliedSomeSelected = useMemo(() => appliedVisibleIds.some(id => selectedIds.has(id)) && !appliedAllSelected, [appliedVisibleIds, selectedIds, appliedAllSelected]);

  const handleSelectAllPending = (checked: boolean | string) => {
    if (checked === true || checked === 'indeterminate') {
      setSelectedIds(prev => new Set([...Array.from(prev), ...pendingVisibleIds]));
    } else {
      // deselect only pending ids
      setSelectedIds(prev => new Set(Array.from(prev).filter(id => !pendingVisibleIds.includes(id))));
    }
  };

  const handleSelectAllApplied = (checked: boolean | string) => {
    if (checked === true || checked === 'indeterminate') {
      setSelectedIds(prev => new Set([...Array.from(prev), ...appliedVisibleIds]));
    } else {
      setSelectedIds(prev => new Set(Array.from(prev).filter(id => !appliedVisibleIds.includes(id))));
    }
  };

  // Apply selected items to gekozen of automatisch gevonden facturen.
  const handleApplySelectedToInvoice = async () => {
    const selected = entries.filter((e) => selectedIds.has(e.id) && !e.appliedInvoiceId);
    if (selected.length === 0) {
      toast({ variant: 'destructive', title: 'Geen (nieuwe) regels geselecteerd' });
      return;
    }
    const groupKeys = Array.from(new Set(selected.map((entry) => {
      const meta = (entryMetaCache.get(entry.id) || buildEntryGroupMeta(entry));
      // cache meta so repeated lookups reuse it
      entryMetaCache.set(entry.id, meta);
      return meta.key;
    })));
    if (groupKeys.length === 0) {
      toast({ variant: 'destructive', title: 'Geen groepen gevonden in selectie' });
      return;
    }

    let successCount = 0;
    const missingTargets: string[] = [];
    for (const key of groupKeys) {
      const items = itemsByGroup.get(key) || [];
      if (items.length === 0) continue;
      const sample = items[0];
      const d = new Date(sample.usageDate);
      const weekId = sample.weekId || `${getYear(d)}-${getISOWeek(d)}`;
      const invoiceId = selectedInvoiceId || findInvoiceIdForGroup(weekId, sample.licensePlate);
      if (!invoiceId) {
        missingTargets.push(`${weekId} (${sample.licensePlate})`);
        continue;
      }
      const ok = await applyGroupToInvoice(key, invoiceId, { silentSuccess: groupKeys.length > 1 });
      if (ok) successCount += 1;
    }

    if (missingTargets.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Geen factuur gevonden',
        description: `Geen conceptfactuur gevonden voor ${missingTargets.join(', ')}`
      });
    }

    if (successCount > 0) {
      if (groupKeys.length > 1) {
        toast({ title: 'Tol toegevoegd', description: `${successCount} groep(en) gekoppeld aan facturen` });
      }
      setSelectedIds(new Set());
    }
  };
  const applyGroupToInvoice = async (groupKey: string, invoiceId: string, options?: { silentSuccess?: boolean }) => {
    if (!invoiceId) {
      toast({ variant: 'destructive', title: 'Kies eerst een factuur' });
      return false;
    }
    const items = itemsByGroup.get(groupKey) || [];
    const pending = items.filter((e) => !e.appliedInvoiceId);
    if (pending.length === 0) {
      toast({ title: 'Geen nieuwe regels in deze groep' });
      return false;
    }
    const sample = pending[0];
    const meta = buildEntryGroupMeta(sample);
    const d = new Date(sample.usageDate);
    const w = sample.weekId || `${getYear(d)}-${getISOWeek(d)}`;
    const day = format(d, 'EEEE', { locale: nl });
    const plate = sample.licensePlate;
    const country = sample.country;
    const vat = sample.vatRate;
    const total = pending.reduce((acc, e) => acc + e.amount, 0);

    try {
      const inv = invoices.find((i) => i.id === invoiceId) as any;
      const parseInvoicePlate = (invRef?: string) => {
        const m = String(invRef || '').match(/\(([A-Za-z0-9\-]+)\)\s*$/);
        return m ? m[1].toUpperCase() : '';
      };
      const invoicePlate = parseInvoicePlate(inv?.reference);
      if (invoicePlate && invoicePlate !== String(plate || '').toUpperCase()) {
        toast({
          variant: 'destructive',
          title: 'Kenteken komt niet overeen',
          description: `Factuur: ${invoicePlate}. Geselecteerde groep kenteken: ${String(plate || '').toUpperCase()}. Koppelen afgebroken.`,
        });
        return false;
      }

      const { data: invLines } = await supabase
        .from('invoice_lines')
        .select('id, description, quantity, unit_price, vat_rate')
        .eq('invoice_id', invoiceId);
      const blanks = (invLines || []).filter(
        (line) => Number(line.unit_price) === 0 && (!line.quantity || Number(line.quantity) === 0) && String(line.description || '').toLowerCase().includes('tol')
      ) as any[];

      const lower = country.toLowerCase();
      const label = lower.startsWith('de') ? 'Duitsland' : lower.startsWith('be') ? 'Belgie' : country;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const dateLabel = `${dd}-${mm}-${yyyy}`;

      const alreadyAppliedEntries = entries.filter(
        (entry) => entry.appliedInvoiceId && buildEntryGroupMeta(entry).key === meta.key
      );
      if (alreadyAppliedEntries.length > 0) {
        const invoiceIds = Array.from(new Set(alreadyAppliedEntries.map((e) => e.appliedInvoiceId).filter((id): id is string => Boolean(id))));
        const invoiceLabels = invoiceIds.map((id) => invoiceMap[id] || id).join(', ');
        toast({
          variant: 'destructive',
          title: 'Tol al toegevoegd',
          description: `Week ${w}, ${day}, ${country} (${vat}%) is al toegevoegd aan: ${invoiceLabels}`,
        });
        return false;
      }

      const exactMatch = (invLines || []).find((line: any) => {
        const desc = String(line.description || '').toLowerCase();
        const hasDay = desc.includes(day.toLowerCase());
        const hasCountry = desc.includes(label.toLowerCase());
        const hasWeek = desc.includes(w.toLowerCase()) || desc.includes(dateLabel.toLowerCase());
        const hasVat = Number(line.vat_rate) === vat;
        const hasAmount = Number(line.unit_price) > 0 || Number(line.quantity) > 0;
        return hasDay && hasCountry && hasWeek && hasVat && hasAmount;
      });
      if (exactMatch) {
        toast({
          variant: 'destructive',
          title: 'Tol al in factuur',
          description: `Week ${w}, ${day}, ${country} (${vat}%) staat al in deze factuur.`,
        });
        return false;
      }

      const match = blanks.find((line) => {
        const desc = String(line.description || '').toLowerCase();
        return desc.includes(dateLabel.toLowerCase()) && desc.includes('tol');
      });
      const amount = Number(total.toFixed(2));
      if (match) {
        const { error } = await supabase
          .from('invoice_lines')
          .update({ quantity: 1, unit_price: amount, vat_rate: vat, total: amount })
          .eq('id', match.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('invoice_lines')
          .insert([{ invoice_id: invoiceId, quantity: 1, description: `${day} ${dateLabel}\nTol ${label}`, unit_price: amount, vat_rate: vat, total: amount }]);
        if (error) throw error;
      }

      const { error: upErr } = await supabase
        .from('toll_entries')
        .update({ applied_invoice_id: invoiceId, applied_at: new Date().toISOString() })
        .in('id', pending.map((p) => p.id));
      if (upErr) throw upErr;

      await fetchEntries();
      setInvoiceMap((prev) => ({
        ...prev,
        [invoiceId]:
          prev[invoiceId] ||
          formatInvoiceReference((invoices.find((i) => i.id === invoiceId) as any)?.reference) ||
          invoiceId,
      }));
      if (!options?.silentSuccess) {
        toast({ title: 'Groep toegevoegd', description: `Factuur bijgewerkt (${vat}%)` });
      }
      return true;
    } catch (e: any) {
      console.error('[Tol] apply group error', e);
      toast({ variant: 'destructive', title: 'Toevoegen mislukt', description: e?.message || String(e) });
      return false;
    }
  };

  const handleApplyGroupToInvoice = async (groupKey: string) => {
    const items = itemsByGroup.get(groupKey) || [];
    if (items.length === 0) return;
    const sample = items[0];
    const d = new Date(sample.usageDate);
    const weekId = sample.weekId || `${getYear(d)}-${getISOWeek(d)}`;
    const invoiceId = selectedInvoiceId || findInvoiceIdForGroup(weekId, sample.licensePlate);
    if (!invoiceId) {
      toast({
        variant: 'destructive',
        title: 'Geen conceptfactuur gevonden',
        description: `Maak of selecteer een factuur voor week ${weekId} (${sample.licensePlate}).`,
      });
      return;
    }
    await applyGroupToInvoice(groupKey, invoiceId);
  };

  const handleResetFilters = () => {
    setFilterWeek("");
    setFilterPlate("");
    setSelectedInvoiceId("");
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = window.confirm(`Weet je zeker dat je ${ids.length} geselecteerde regel(s) wilt verwijderen?`);
    if (!ok) return;
    const { error } = await supabase.from('toll_entries').delete().in('id', ids);
    if (error) {
      console.error('Delete selected entries error:', error);
      toast({ variant: 'destructive', title: 'Selectie verwijderen mislukt' });
      return;
    }
    setEntries(prev => prev.filter(e => !selectedIds.has(e.id)));
    setSelectedIds(new Set());
    toast({ title: 'Geselecteerde regels verwijderd' });
  };

  // Unapply selected toll entries from any invoice (clear applied_invoice_id)
  const handleUnapplySelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase
        .from('toll_entries')
        .update({ applied_invoice_id: null, applied_at: null })
        .in('id', ids);
      if (error) throw error;
      setEntries(prev => prev.map(e => ids.includes(e.id) ? { ...e, appliedInvoiceId: null, appliedAt: null } : e));
      toast({ title: 'Ontkoppeld', description: `${ids.length} regel(s) losgekoppeld van factuur` });
      setSelectedIds(new Set());
    } catch (e: any) {
      console.error('[Tol] unapply selected error', e);
      toast({ variant: 'destructive', title: 'Ontkoppelen mislukt', description: e?.message || String(e) });
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!id) return;
    const ok = window.confirm('Weet je zeker dat je deze tolregel wilt verwijderen?');
    if (!ok) return;
    const { error } = await supabase.from('toll_entries').delete().eq('id', id);
    if (error) {
      console.error('Delete toll entry error:', error);
      toast({ variant: 'destructive', title: 'Verwijderen mislukt' });
      return;
    }
    setEntries(prev => prev.filter(e => e.id !== id));
    toast({ title: 'Tolregel verwijderd' });
  };

  const handleDeleteGroup = async (groupKey: string) => {
    const items = itemsByGroup.get(groupKey) || [];
    if (items.length === 0) return;
    const ok = window.confirm(`Weet je zeker dat je ${items.length} regel(s) in deze groep wilt verwijderen?`);
    if (!ok) return;
    const ids = items.map(i => i.id);
    const { error } = await supabase.from('toll_entries').delete().in('id', ids);
    if (error) {
      console.error('Delete toll group error:', error);
      toast({ variant: 'destructive', title: 'Groep verwijderen mislukt' });
      return;
    }
    setEntries(prev => prev.filter(e => !ids.includes(e.id)));
    toast({ title: 'Groep verwijderd' });
  };

  // Unapply whole group from invoice
  const handleUnapplyGroup = async (groupKey: string) => {
    const items = itemsByGroup.get(groupKey) || [];
    const ids = items.map(i => i.id);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase
        .from('toll_entries')
        .update({ applied_invoice_id: null, applied_at: null })
        .in('id', ids);
      if (error) throw error;
      setEntries(prev => prev.map(e => ids.includes(e.id) ? { ...e, appliedInvoiceId: null, appliedAt: null } : e));
      toast({ title: 'Groep ontkoppeld', description: `${ids.length} regel(s) losgekoppeld` });
    } catch (e: any) {
      console.error('[Tol] unapply group error', e);
      toast({ variant: 'destructive', title: 'Ontkoppelen mislukt', description: e?.message || String(e) });
    }
  };

  // Fetch invoice labels (number or reference) for applied invoices
  useEffect(() => {
    const ids = Array.from(new Set(entries.map(e => e.appliedInvoiceId).filter(Boolean) as string[]));
    if (ids.length === 0) { setInvoiceMap({}); return; }
    let active = true;
    supabase.from('invoices').select('id, invoice_number, reference, status').in('id', ids).then(({ data, error }) => {
      if (!active || error) return;
      const m: Record<string, string> = {};
      (data || []).forEach((r: any) => {
        const label = formatInvoiceReference(r.reference) || r.id;
        m[r.id] = label;
      });
      setInvoiceMap(m);
    });
    return () => { active = false; };
  }, [entries]);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Toloverzichten</CardTitle>
          <CardDescription>Upload Excelbestanden met tol per week en per kenteken en bekijk/geef door aan facturen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-3">
            <h3 className="font-semibold">Excel upload</h3>
            <p className="text-sm text-muted-foreground">Verwachte kolommen: Land, Kenteken, Datum gebruik, Bedrag ex btw, BTW tarief.</p>
            <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files && e.target.files[0] && handleFile(e.target.files[0])} />
            {columnOptions.length > 0 && (
              <div className="space-y-4 rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">Kolommen koppelen</p>
                    {selectedSheetName && <p className="text-xs text-muted-foreground">Sheet: {selectedSheetName}</p>}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={handleAutoDetectMapping}>
                    Kolommen autodetect
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {mappingFieldMeta.map(({ key, label, hint, required }) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-sm font-medium">
                        {label}
                        {required && <span className="text-destructive"> *</span>}
                      </Label>
                      <Select value={columnMapping[key] ?? SELECT_NONE_VALUE} onValueChange={(v) => handleMappingChange(key, v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Kies kolom" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SELECT_NONE_VALUE}>Geen</SelectItem>
                          {columnOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{hint}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {rawSheetRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    {parsed.length > 0 ? (
                      <span>
                        Voorbeeld uit: {fileName}
                        {selectedSheetName ? " (" + selectedSheetName + ")" : ""} - {parsed.length} regels klaar voor import
                      </span>
                    ) : (
                      "Geen voorbeeld beschikbaar. Selecteer de verplichte kolommen voor datum, kenteken, land en bedrag."
                    )}
                  </div>
                  <Button onClick={handleImport} disabled={isImporting || parsed.length === 0}>
                    {isImporting ? "Bezig..." : "Importeer"}
                  </Button>
                </div>
                {parsed.length > 0 ? (
                  <div className="border rounded-md overflow-auto max-h-[320px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead className="w-24">Tijdstip</TableHead>
                          <TableHead className="w-24">Dag</TableHead>
                          <TableHead className="w-28">Kenteken</TableHead>
                          <TableHead className="w-16">Land</TableHead>
                          <TableHead>Bedrag (ex)</TableHead>
                          <TableHead className="w-16 text-right">BTW %</TableHead>
                          <TableHead className="w-24">Week</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsed.slice(0, 20).map((r, idx) => (
                          <TableRow key={[r.usageDate, r.licensePlate, idx].join("-")}>
                            <TableCell>{format(new Date(r.usageDate), "dd-MM-yyyy")}</TableCell>
                            <TableCell>{r.usageTime ?? "-"}</TableCell>
                            <TableCell>{format(new Date(r.usageDate), "EEEE", { locale: nl })}</TableCell>
                            <TableCell>{r.licensePlate}</TableCell>
                            <TableCell>{r.country}</TableCell>
                            <TableCell>{formatCurrency(r.amount)}</TableCell>
                            <TableCell>{r.vatRate}%</TableCell>
                            <TableCell>{r.weekId}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Selecteer minimaal datum, kenteken, land en bedrag om de gegevens te kunnen importeren.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Overzicht</h3>
            <div className="flex flex-wrap gap-3 items-center">
              {/* Use a non-empty sentinel for "all" to avoid Radix empty-value restriction */}
              <div className="w-[200px]">
                <Select value={filterWeek || "__ALL__"} onValueChange={(v) => setFilterWeek(v === "__ALL__" ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Week filter" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem key="all-weeks" value="__ALL__">Alle weken</SelectItem>
                    {recentWeeks.map((w) => (
                      <SelectItem key={w} value={w}>{w}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[200px]">
                <Select value={filterPlate || "__ALL__"} onValueChange={(v) => setFilterPlate(v === "__ALL__" ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Kenteken" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem key="all-plates" value="__ALL__">Alle kentekens</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.licensePlate}>{v.licensePlate}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[280px]">
                <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Kies conceptfactuur" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {invoices.map((inv) => {
                      const label = formatInvoiceReference(inv.reference) || `${inv.id.slice(0, 8)}`;
                      return (
                        <SelectItem key={inv.id} value={inv.id}>{label}</SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={handleResetFilters}>Reset filters</Button>
              <div className="flex gap-2">
                <Button
                  onClick={handleApplySelectedToInvoice}
                  disabled={selectedIds.size === 0}
                >
                  Aan factuur toevoegen
                </Button>
                <Button
                  variant="outline"
                  onClick={handleUnapplySelected}
                  disabled={selectedIds.size === 0}
                >
                  Ontkoppelen selectie
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDeleteSelected}
                  disabled={selectedIds.size === 0}
                >
                  Verwijder selectie
                </Button>
              </div>
            </div>
            <div className="space-y-2 pt-6">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Samenvatting — Nog toe te voegen</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={pendingVisibleIds.filter(id => selectedIds.has(id)).length === 0}
                >
                  Verwijder selectie ({pendingVisibleIds.filter(id => selectedIds.has(id)).length})
                </Button>
              </div>
              <div className="border rounded-md overflow-auto max-h-[520px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 p-2"></TableHead>
                      <TableHead className="w-6 p-2">
                        <Checkbox checked={(pendingAllSelected ? true : (pendingSomeSelected ? 'indeterminate' : false)) as any} onCheckedChange={(v) => handleSelectAllPending(v as any)} />
                      </TableHead>
                      <TableHead className="w-24 p-2">Week</TableHead>
                      <TableHead className="w-24 p-2">Dag</TableHead>
                      <TableHead className="w-28 p-2">Kenteken</TableHead>
                      <TableHead className="w-16 p-2">Land</TableHead>
                      <TableHead className="w-16 p-2 text-right">BTW %</TableHead>
                      <TableHead className="w-48 p-2">Factuur</TableHead>
                      <TableHead className="w-28 p-2 text-right">Totaal (ex)</TableHead>
                      <TableHead className="w-16 p-2 text-right">Aantal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingEntries ? (
                      <TableRow><TableCell colSpan={7}>Laden…</TableCell></TableRow>
                    ) : weeklySummaryPending.length === 0 ? (
                      <TableRow><TableCell colSpan={7}>Geen resultaten</TableCell></TableRow>
                    ) : (
                      weeklySummaryPending.map((g, idx) => {
                        const groupKey = `${g.weekId}|${g.day}|${g.licensePlate}|${g.country}|${g.vatRate}`;
                        const items = itemsByGroupPending.get(groupKey) || [];
                        const allInGroup = items.length > 0 && items.every(i => selectedIds.has(i.id));
                        const anyInGroup = items.some(i => selectedIds.has(i.id));
                        const checked: any = allInGroup ? true : (anyInGroup ? 'indeterminate' : false);
                        const isExpanded = expanded.has(groupKey);
                        const sortedItems = [...items].sort((a, b) => (a.usageDate.localeCompare(b.usageDate) || (a.usageTime || '').localeCompare(b.usageTime || '')));
                        return (
                        <Fragment key={`pending-group-${groupKey}`}>
                        <TableRow key={`${g.weekId}-${g.day}-${g.licensePlate}-${g.country}-${g.vatRate}-${idx}`}>
                          <TableCell className="w-8 p-2">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleGroup(groupKey)} aria-label="Toon details">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="w-6 p-2">
                            <Checkbox checked={checked} onCheckedChange={(v) => toggleGroupSelected(groupKey, v as any)} />
                          </TableCell>
                          <TableCell className="w-24 p-2">{g.weekId}</TableCell>
                          <TableCell className="w-24 p-2">{g.day}</TableCell>
                          <TableCell className="w-28 p-2">{g.licensePlate}</TableCell>
                          <TableCell className="w-16 p-2">{g.country}</TableCell>
                          <TableCell className="w-16 p-2 text-right">{g.vatRate}%</TableCell>
                          <TableCell className="w-48 p-2">-</TableCell>
                          <TableCell className="w-28 p-2 text-right">{formatCurrency(g.total)}</TableCell>
                          <TableCell className="w-16 p-2 text-right">{g.count}</TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${groupKey}-details`}>
                            <TableCell />
                            <TableCell colSpan={9} className="bg-muted/40 p-3">
                              <div className="space-y-2 text-sm">
                                {sortedItems.map((item) => (
                                  <div key={item.id} className="grid grid-cols-[100px_80px_112px_64px_112px_1fr] gap-x-4 items-center">
                                    <span className="font-medium">{format(new Date(item.usageDate), "dd-MM-yyyy")}</span>
                                    <span className="text-right">{item.usageTime || "-"}</span>
                                    <span>{item.licensePlate}</span>
                                    <span>{item.country}</span>
                                    <span className="text-right">{formatCurrency(item.amount)} ex</span>
                                    <span className="text-muted-foreground truncate">{item.source || "-"}</span>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="space-y-2 pt-6">
              <h4 className="font-semibold">Toegevoegd aan factuur</h4>
              <div className="border rounded-md overflow-auto max-h-[520px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 p-2"></TableHead>
                      <TableHead className="w-6 p-2">
                        <Checkbox checked={(appliedAllSelected ? true : (appliedSomeSelected ? 'indeterminate' : false)) as any} onCheckedChange={(v) => handleSelectAllApplied(v as any)} />
                      </TableHead>
                      <TableHead className="w-24 p-2">Week</TableHead>
                      <TableHead className="w-24 p-2">Dag</TableHead>
                      <TableHead className="w-28 p-2">Kenteken</TableHead>
                      <TableHead className="w-16 p-2">Land</TableHead>
                      <TableHead className="w-16 p-2 text-right">BTW %</TableHead>
                      <TableHead className="w-48 p-2">Factuur</TableHead>
                      <TableHead className="w-28 p-2 text-right">Totaal (ex)</TableHead>
                      <TableHead className="w-16 p-2 text-right">Aantal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingEntries ? (
                      <TableRow><TableCell colSpan={7}>Laden.</TableCell></TableRow>
                    ) : weeklySummaryApplied.length === 0 ? (
                      <TableRow><TableCell colSpan={7}>Geen resultaten</TableCell></TableRow>
                    ) : (
                      weeklySummaryApplied.map((g, idx) => {
                        const groupKey = `${g.weekId}|${g.day}|${g.licensePlate}|${g.country}|${g.vatRate}`;
                        const items = itemsByGroupApplied.get(groupKey) || [];
                        const allInGroup = items.length > 0 && items.every(i => selectedIds.has(i.id));
                        const anyInGroup = items.some(i => selectedIds.has(i.id));
                        const checked: any = allInGroup ? true : (anyInGroup ? 'indeterminate' : false);
                        const labels = (g as any).invoiceIds?.map((id: string) => invoiceMap[id]).filter(Boolean) as string[];
                        const isExpanded = expanded.has(groupKey);
                        const sortedItems = [...items].sort((a, b) => (a.usageDate.localeCompare(b.usageDate) || (a.usageTime || '').localeCompare(b.usageTime || '')));
                        return (
                        <Fragment key={`applied-group-${groupKey}`}>
                        <TableRow key={`applied-${g.weekId}-${g.day}-${g.licensePlate}-${g.country}-${g.vatRate}-${idx}`}>
                          <TableCell className="w-8 p-2">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleGroup(groupKey)} aria-label="Toon details">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="w-6 p-2">
                            <Checkbox checked={checked} onCheckedChange={(v) => toggleGroupSelected(groupKey, v as any)} />
                          </TableCell>
                          <TableCell className="w-24 p-2">{g.weekId}</TableCell>
                          <TableCell className="w-24 p-2">{g.day}</TableCell>
                          <TableCell className="w-28 p-2">{g.licensePlate}</TableCell>
                          <TableCell className="w-16 p-2">{g.country}</TableCell>
                          <TableCell className="w-16 p-2 text-right">{g.vatRate}%</TableCell>
                          <TableCell className="w-48 p-2">{(!labels || labels.length === 0) ? '-' : (labels.length === 1 ? labels[0] : `Meerdere (${labels.join(', ')})`)}</TableCell>
                          <TableCell className="w-28 p-2 text-right">{formatCurrency(g.total)}</TableCell>
                          <TableCell className="w-16 p-2 text-right">{g.count}</TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`applied-${groupKey}-details`}>
                            <TableCell />
                            <TableCell colSpan={9} className="bg-muted/40 p-3">
                              <div className="space-y-2 text-sm">
                                {sortedItems.map((item) => (
                                  <div key={item.id} className="grid grid-cols-[100px_80px_112px_64px_112px_1fr_auto] gap-x-4 items-center">
                                    <span className="font-medium">{format(new Date(item.usageDate), "dd-MM-yyyy")}</span>
                                    <span className="text-right">{item.usageTime || "-"}</span>
                                    <span>{item.licensePlate}</span>
                                    <span>{item.country}</span>
                                    <span className="text-right">{formatCurrency(item.amount)} ex</span>
                                    <span className="text-muted-foreground truncate">{item.source || "-"}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {item.appliedInvoiceId ? (invoiceMap[item.appliedInvoiceId] || item.appliedInvoiceId) : 'Nog niet gekoppeld'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          </CardContent>
          </Card>
          </div>
          );
}






















