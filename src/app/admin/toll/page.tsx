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
  amount: number;
  vatRate: number;
  weekId: string;
  source?: string;
};

// Helper type for tri-state checkbox handling in JSX
type CheckedTri = boolean | "indeterminate";

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

function normalizeHeader(h: string): string {
  const key = (h || '').toString().trim().toLowerCase();
  // Fuzzy contains to be robust against varied exports
  if (key.includes('serviceland') || key.includes('land') || key.includes('country')) return 'country';
  if (key.includes('nummerplaat') || key.includes('kenteken') || key.includes('license') || key.includes('plate')) return 'licensePlate';
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

export default function TollOverviewPage() {
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [filterWeek, setFilterWeek] = useState<string>("");
  const [filterPlate, setFilterPlate] = useState<string>("");
  const [entries, setEntries] = useState<TollEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [invoiceMap, setInvoiceMap] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'raw' | 'summary'>("raw");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [invoices, setInvoices] = useState<Array<{ id: string; invoice_number: string; reference?: string; status?: string; created_at?: string }>>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");

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

  const handleFile = async (file: File) => {
    setParsed([]);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      let best: { sheet: string; rows: ParsedRow[] } | null = null;

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });
        if (!raw || raw.length === 0) continue;
        const { headers, startIndex } = detectHeaderRow(raw as any[][]);
        let rowsRaw = raw.slice(startIndex);
        let mapped: ParsedRow[] = [];
        // Detect specifiek Elcon-profiel: kolommen op vaste posities aanwezig in headerregel
        const headerRow = raw[startIndex-1] as any[] | undefined;
        const headerCheck = (idx: number, pattern: RegExp) => (headerRow && headerRow[idx] && pattern.test(String(headerRow[idx]).toLowerCase()));
        const looksLikeElcon = headerRow && headerRow.length >= 26 && (
          headerCheck(0, /service.?land|land|country/) &&
          headerCheck(3, /nummerplaat|kenteken|license|plate/) &&
          headerCheck(11, /datum|date/) &&
          headerCheck(23, /berekend|ex.?btw|excl|amount|bedrag/) &&
          headerCheck(25, /btw|vat/)
        );

        if (looksLikeElcon) {
          mapped = parseWithFixedColumns(rowsRaw as any[][], file.name, sheetName);
        }
        // Path A: header-based mapping
        if (mapped.length === 0) {
          for (const row of rowsRaw) {
            const obj: any = {};
            headers.forEach((h, idx) => { obj[h] = row[idx]; });
            const dateCell = obj['usageDate'];
            const iso = dateCell instanceof Date ? `${dateCell.getFullYear()}-${String(dateCell.getMonth()+1).padStart(2,'0')}-${String(dateCell.getDate()).padStart(2,'0')}` : toIsoDate(dateCell);
            if (!iso) continue;
            const amountNum = parseMoney(obj['amount']);
            const vatParsed = parseVat(obj['vatRate']);
            const vatNum = vatParsed == null ? defaultVatForCountry(country) : vatParsed;
            const country = mapServiceLandToCountryCode(String(obj['country'] || '').trim());
            const plate = String(obj['licensePlate'] || '').trim().toUpperCase();
            if (!country || !plate) continue;
            mapped.push({
              country,
              licensePlate: plate,
              usageDate: iso,
              amount: amountNum ?? 0,
              vatRate: vatNum ?? 21,
              weekId: weekIdFromIso(iso),
              source: `${file.name} (${sheetName})`,
            });
          }
        }
        // Path B: content inference if header path yielded too few
        if (mapped.length === 0) {
          const infer = inferColumns(rowsRaw as any[][]);
          const tmp: ParsedRow[] = [];
          for (const row of rowsRaw) {
            const vDate = infer.dateCol !== undefined ? row[infer.dateCol] : undefined;
            const vPlate = infer.plateCol !== undefined ? row[infer.plateCol] : undefined;
            const vCountry = infer.countryCol !== undefined ? row[infer.countryCol] : undefined;
            const vAmount = infer.amountCol !== undefined ? row[infer.amountCol] : undefined;
            const vVat = infer.vatCol !== undefined ? row[infer.vatCol] : undefined;
            const iso = vDate instanceof Date ? `${vDate.getFullYear()}-${String(vDate.getMonth()+1).padStart(2,'0')}-${String(vDate.getDate()).padStart(2,'0')}` : toIsoDate(vDate);
            if (!iso) continue;
            const plate = String(vPlate || '').trim().toUpperCase();
            const country = mapServiceLandToCountryCode(String(vCountry || '').trim());
            if (!plate || !country) continue;
            const amountNum = parseMoney(vAmount) ?? 0;
            const vatParsed = parseVat(vVat);
            const vatNum = vatParsed == null ? defaultVatForCountry(country) : vatParsed;
            tmp.push({
              country,
              licensePlate: plate,
              usageDate: iso,
              amount: amountNum,
              vatRate: vatNum,
              weekId: weekIdFromIso(iso),
              source: `${file.name} (${sheetName})`,
            });
          }
          mapped = tmp;
        }
        // Path C: specifiek vast kolomprofiel (A,D,L,X,Z) als beide paden niets opleveren
        if (mapped.length === 0) {
          mapped = parseWithFixedColumns(rowsRaw as any[][], file.name, sheetName);
        }
        if (!best || mapped.length > best.rows.length) {
          best = { sheet: sheetName, rows: mapped };
        }
      }

      const finalRows = best?.rows || [];
      setParsed(finalRows);
      if (finalRows.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Geen regels herkend',
          description: 'Controleer of het bestand kolommen bevat voor Land, Kenteken, Datum gebruik, Bedrag (ex) en BTW% Ã¢â‚¬â€ eventueel op een andere tab/sheet of lager op de pagina.',
        });
      } else {
        toast({ title: `Voorbeeld geladen (${finalRows.length} regels)` });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Fout bij lezen Excel" });
    }
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
        .select("license_plate, usage_date, country, amount, vat_rate, applied_invoice_id");
      
      if (fetchError) {
        console.error("Error fetching existing entries:", fetchError);
        // Continue anyway, but log the error
      }
      
      // Create a Set of existing entry keys for fast lookup
      // Include both entries with and without applied_invoice_id
      const existingKeys = new Set<string>();
      const appliedKeys = new Set<string>(); // Track which ones are already applied to invoices
      
      (existingEntries || []).forEach((entry: any) => {
        const key = `${entry.license_plate}|${entry.usage_date}|${entry.country}|${entry.amount}|${entry.vat_rate}`;
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
        const key = `${r.licensePlate}|${r.usageDate}|${r.country}|${r.amount}|${r.vatRate}`;
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

  // Apply selected items to a chosen invoice as invoice lines.
  const handleApplySelectedToInvoice = async () => {
    const invoiceId = selectedInvoiceId;
    if (!invoiceId) { toast({ variant: 'destructive', title: 'Kies eerst een factuur' }); return; }
    const selected = entries.filter(e => selectedIds.has(e.id) && !e.appliedInvoiceId);
    if (selected.length === 0) { toast({ variant: 'destructive', title: 'Geen (nieuwe) regels geselecteerd' }); return; }

    const inv = invoices.find(i => i.id === invoiceId) as any;
    const parseInvoicePlate = (invRef?: string) => {
      const m = String(invRef || '').match(/\(([A-Za-z0-9\-]+)\)\s*$/);
      return m ? m[1].toUpperCase() : '';
    };

    // Group exactly zoals samenvatting: Week|Dag|Kenteken|Land|BTW
    const byKey = new Map<string, { weekId: string; day: string; plate: string; country: string; vat: number; total: number; itemIds: string[]; firstDate: string }>();
    for (const e of selected) {
      const d = new Date(e.usageDate);
      const w = e.weekId || `${getYear(d)}-${getISOWeek(d)}`;
      const day = format(d, 'EEEE', { locale: nl });
      const key = `${w}|${day}|${e.licensePlate}|${e.country}|${e.vatRate}`;
      const curr = byKey.get(key);
      if (curr) {
        curr.total += e.amount;
        curr.itemIds.push(e.id);
      } else {
        const dd0 = String(d.getDate()).padStart(2,'0');
        const mm0 = String(d.getMonth()+1).padStart(2,'0');
        const yyyy0 = d.getFullYear();
        byKey.set(key, { weekId: w, day, plate: e.licensePlate, country: e.country, vat: e.vatRate, total: e.amount, itemIds: [e.id], firstDate: `${yyyy0}-${mm0}-${dd0}` });
      }
    }
    try {
      // Haal bestaande factuurregels (voor witregels matching)
      const { data: invLines } = await supabase
        .from('invoice_lines')
        .select('id, description, quantity, unit_price, vat_rate')
        .eq('invoice_id', invoiceId);

      const blanks = new Set<string>((invLines || [])
        .filter(l => (Number(l.unit_price) === 0) && (!l.quantity || Number(l.quantity) === 0) && String(l.description || '').toLowerCase().includes('tol'))
        .map(l => l.id));

      // Helper voor land-label in factuurregel
      const countryLabel = (c: string) => {
        const s = (c || '').toLowerCase();
        if (s.startsWith('de')) return 'Duitsland';
        if (s.startsWith('be')) return 'België'
        if (s.startsWith('fr')) return 'Frankrijk';
        if (s.startsWith('lu')) return 'Luxemburg';
        return c;
      };

      const updates: Array<{ id: string; payload: any }> = [];
      const inserts: any[] = [];
      const applied: string[] = [];

    const groups = Array.from(byKey.values()).sort((a,b) => a.firstDate.localeCompare(b.firstDate));

    // Kenteken-check: factuur mag alleen tol krijgen van hetzelfde kenteken
    const invoicePlate = parseInvoicePlate(inv?.reference);
    if (invoicePlate) {
      const mismatches = groups.filter(g => (g.plate || '').toUpperCase() !== invoicePlate);
      if (mismatches.length > 0) {
        toast({ variant: 'destructive', title: 'Kenteken komt niet overeen', description: `Factuur: ${invoicePlate}. Geselecteerde groep kenteken: ${(mismatches[0].plate || '').toUpperCase()}. Koppelen afgebroken.` });
        return;
      }
    }
      // Check for duplicates: prevent adding the same toll group (week/day/plate/country/vat) twice
      const duplicateWarnings: string[] = [];
      const processedGroupKeys = new Set<string>(); // Track groups already processed in this operation
      
      // Fetch invoice labels for warnings
      const invoiceIdSet = new Set<string>();
      entries.forEach(e => {
        if (e.appliedInvoiceId) invoiceIdSet.add(e.appliedInvoiceId);
      });
      const invoiceIdsArray = Array.from(invoiceIdSet);
      let invoiceLabelMap = { ...invoiceMap };
      if (invoiceIdsArray.length > 0) {
        const { data: invoiceData } = await supabase
          .from('invoices')
          .select('id, invoice_number, reference')
          .in('id', invoiceIdsArray);
        if (invoiceData) {
          invoiceData.forEach((inv: any) => {
            const label = inv.invoice_number || inv.reference || inv.id;
            invoiceLabelMap[inv.id] = label;
          });
        }
      }
      
      // Check if toll entries for this group are already applied to ANY invoice
      for (const g of groups) {
        const groupKey = `${g.weekId}|${g.day}|${g.plate}|${g.country}|${g.vat}`;
        
        // Check if any entries with this group key are already applied to an invoice
        const alreadyAppliedEntries = entries.filter(e => {
          if (e.appliedInvoiceId) {
            const d = new Date(e.usageDate);
            const w = e.weekId || `${getYear(d)}-${getISOWeek(d)}`;
            const day = format(d, 'EEEE', { locale: nl });
            const entryGroupKey = `${w}|${day}|${e.licensePlate}|${e.country}|${e.vatRate}`;
            return entryGroupKey === groupKey;
          }
          return false;
        });
        
        if (alreadyAppliedEntries.length > 0) {
          const invoiceIds = Array.from(new Set(alreadyAppliedEntries.map(e => e.appliedInvoiceId).filter(Boolean) as string[]));
          const invoiceLabels = invoiceIds.map(id => invoiceLabelMap[id] || invoices.find(i => i.id === id)?.invoice_number || invoices.find(i => i.id === id)?.reference || id).join(', ');
          duplicateWarnings.push(`Week ${g.weekId}, ${g.day}, ${g.country} (${g.vat}%) - al toegevoegd aan: ${invoiceLabels}`);
        }
        
        // Check if this group is already in the invoice lines
        const firstId = g.itemIds[0];
        const entry = selected.find(e => e.id === firstId)!;
        const d = new Date(entry.usageDate);
        const dd = String(d.getDate()).padStart(2,'0');
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const yyyy = d.getFullYear();
        const dateLabel = `${dd}-${mm}-${yyyy}`;
        const label = countryLabel(g.country);
        const dayNameMap: any = { 'maandag':'Maandag','dinsdag':'Dinsdag','woensdag':'Woensdag','donderdag':'Donderdag','vrijdag':'Vrijdag','zaterdag':'Zaterdag','zondag':'Zondag' };
        const dayLabel = dayNameMap[g.day.toLowerCase()] || g.day;
        const lc = ('Tol ' + label).toLowerCase();
        
        // Check for exact match: same week, day, country, and VAT rate
        const exactMatch = (invLines || []).find((l: any) => {
          const desc = String(l.description || '').toLowerCase();
          const hasDay = desc.includes(dayLabel.toLowerCase());
          const hasCountry = desc.includes(lc);
          const hasWeek = desc.includes(g.weekId.toLowerCase()) || desc.includes(dateLabel.toLowerCase());
          const hasVat = Number(l.vat_rate) === g.vat;
          const hasAmount = Number(l.unit_price) > 0 || Number(l.quantity) > 0;
          return hasDay && hasCountry && hasWeek && hasVat && hasAmount;
        });
        
        if (exactMatch) {
          duplicateWarnings.push(`Week ${g.weekId}, ${g.day}, ${g.country} (${g.vat}%) - al aanwezig in deze factuur`);
          // Skip adding this group
          continue;
        }
        
        // Check if this group key was already processed in this batch
        if (processedGroupKeys.has(groupKey)) {
          duplicateWarnings.push(`Week ${g.weekId}, ${g.day}, ${g.country} (${g.vat}%) - dubbel in selectie`);
          continue;
        }
        processedGroupKeys.add(groupKey);
      }
      
      // Show warnings if duplicates found
      if (duplicateWarnings.length > 0) {
        toast({
          variant: "destructive",
          title: "Dubbele tol regels gedetecteerd",
          description: `${duplicateWarnings.length} groep(en) overgeslagen:\n${duplicateWarnings.slice(0, 3).join('\n')}${duplicateWarnings.length > 3 ? `\n...en ${duplicateWarnings.length - 3} meer` : ''}`,
          duration: 10000,
        });
      }
      
      // Filter out duplicate groups before processing
      const uniqueGroups = groups.filter((g, idx) => {
        const groupKey = `${g.weekId}|${g.day}|${g.plate}|${g.country}|${g.vat}`;
        
        // Skip if already applied to another invoice
        const alreadyAppliedEntries = entries.filter(e => {
          if (e.appliedInvoiceId) {
            const d = new Date(e.usageDate);
            const w = e.weekId || `${getYear(d)}-${getISOWeek(d)}`;
            const day = format(d, 'EEEE', { locale: nl });
            const entryGroupKey = `${w}|${day}|${e.licensePlate}|${e.country}|${e.vatRate}`;
            return entryGroupKey === groupKey;
          }
          return false;
        });
        if (alreadyAppliedEntries.length > 0) return false;
        
        // Skip if already in invoice
        const firstId = g.itemIds[0];
        const entry = selected.find(e => e.id === firstId)!;
        const d = new Date(entry.usageDate);
        const dd = String(d.getDate()).padStart(2,'0');
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const yyyy = d.getFullYear();
        const dateLabel = `${dd}-${mm}-${yyyy}`;
        const label = countryLabel(g.country);
        const dayNameMap: any = { 'maandag':'Maandag','dinsdag':'Dinsdag','woensdag':'Woensdag','donderdag':'Donderdag','vrijdag':'Vrijdag','zaterdag':'Zaterdag','zondag':'Zondag' };
        const dayLabel = dayNameMap[g.day.toLowerCase()] || g.day;
        const lc = ('Tol ' + label).toLowerCase();
        
        const exactMatch = (invLines || []).find((l: any) => {
          const desc = String(l.description || '').toLowerCase();
          const hasDay = desc.includes(dayLabel.toLowerCase());
          const hasCountry = desc.includes(lc);
          const hasWeek = desc.includes(g.weekId.toLowerCase()) || desc.includes(dateLabel.toLowerCase());
          const hasVat = Number(l.vat_rate) === g.vat;
          const hasAmount = Number(l.unit_price) > 0 || Number(l.quantity) > 0;
          return hasDay && hasCountry && hasWeek && hasVat && hasAmount;
        });
        if (exactMatch) return false;
        
        // Skip if duplicate in batch
        const isFirstOccurrence = groups.findIndex(g2 => {
          const key2 = `${g2.weekId}|${g2.day}|${g2.plate}|${g2.country}|${g2.vat}`;
          return key2 === groupKey;
        }) === idx;
        
        return isFirstOccurrence;
      });
      
      for (const g of uniqueGroups) {
        // Vind voorbeeld-regel voor datum
        const firstId = g.itemIds[0];
        const entry = selected.find(e => e.id === firstId)!;
        const d = new Date(entry.usageDate);
        const dd = String(d.getDate()).padStart(2,'0');
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const yyyy = d.getFullYear();
        const dateLabel = `${dd}-${mm}-${yyyy}`;
        const label = countryLabel(g.country);
        const dayNameMap: any = { 'maandag':'Maandag','dinsdag':'Dinsdag','woensdag':'Woensdag','donderdag':'Donderdag','vrijdag':'Vrijdag','zaterdag':'Zaterdag','zondag':'Zondag' };
        const dayLabel = dayNameMap[g.day.toLowerCase()] || g.day;
        const lc = ('Tol ' + label).toLowerCase();
        const tryMatchAny = (pred: (l:any)=>boolean) => (invLines || []).find(pred) as any;
        const tryMatchBlank = (pred: (l:any)=>boolean) => (invLines || []).find(l => blanks.has(l.id) && pred(l)) as any;
        const isDescDateAndTol = (l:any) => { const desc = String(l.description||'').toLowerCase(); return desc.includes(dateLabel.toLowerCase()) && desc.includes('tol'); };
        const isDescDayAndLabel = (l:any) => String(l.description||'').toLowerCase().includes(dayLabel.toLowerCase()) && String(l.description||'').toLowerCase().includes(lc);
        const isDescLabel = (l:any) => String(l.description||'').toLowerCase().includes(lc);
        // 1) Prefer bestaande nietâ€'lege regel (voorkomt duplicaten)
        let lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDateAndTol(l));
        if (!lookFor) lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescDayAndLabel(l));
        if (!lookFor) lookFor = tryMatchAny(l => (Number(l.unit_price) > 0 || Number(l.quantity) > 0) && isDescLabel(l));
        // 2) Anders: probeer witregel
        if (!lookFor) lookFor = tryMatchBlank(isDescDateAndTol);
        if (!lookFor) lookFor = tryMatchBlank(isDescDayAndLabel);
        if (!lookFor) lookFor = tryMatchBlank(isDescLabel);

        const amount = Number(g.total.toFixed(2));
        if (lookFor) {
          updates.push({ id: lookFor.id, payload: { quantity: 1, unit_price: amount, vat_rate: g.vat, total: amount } });
          blanks.delete(lookFor.id);
        } else {
          inserts.push({ invoice_id: invoiceId, quantity: 1, description: `${g.day} ${dateLabel}\nTol ${label}`, unit_price: amount, vat_rate: g.vat, total: amount });
        }
        applied.push(...g.itemIds);
      }
      
      // If no groups to process after filtering duplicates
      if (applied.length === 0) {
        toast({
          variant: "destructive",
          title: "Geen regels toegevoegd",
          description: "Alle geselecteerde regels zijn al toegevoegd of dubbel.",
        });
        return;
      }

      // Uitvoeren updates/inserts
      for (const u of updates) {
        const { error } = await supabase.from('invoice_lines').update(u.payload).eq('id', u.id);
        if (error) throw error;
      }
      if (inserts.length > 0) {
        const { error } = await supabase.from('invoice_lines').insert(inserts);
        if (error) throw error;
      }

      const { error: upErr } = await supabase
        .from('toll_entries')
        .update({ applied_invoice_id: invoiceId, applied_at: new Date().toISOString() })
        .in('id', applied);
      if (upErr) throw upErr;

      // Refresh entries from database to ensure consistency
      await fetchEntries();
      setInvoiceMap(prev => ({
        ...prev,
        [invoiceId]: prev[invoiceId]
          || invoices.find(i => i.id === invoiceId)?.invoice_number
          || (invoices.find(i => i.id === invoiceId) as any)?.reference
          || invoiceId
      }));
      toast({ title: 'Toegevoegd aan factuur', description: `${updates.length + inserts.length} regel(s) verwerkt` });
      setSelectedIds(new Set());
    } catch (e: any) {
      console.error('[Tol] apply to invoice error', e);
      toast({ variant: 'destructive', title: 'Toevoegen mislukt', description: e?.message || String(e) });
    }
  };

  // Reset filters back to initial state
  const handleResetFilters = () => {
    setFilterWeek("");
    setFilterPlate("");
    setSelectedInvoiceId("");
    setSelectedIds(new Set());
  };

  const handleApplyGroupToInvoice = async (groupKey: string) => {
    const invoiceId = selectedInvoiceId;
    if (!invoiceId) { toast({ variant: 'destructive', title: 'Kies eerst een factuur' }); return; }
    const items = itemsByGroup.get(groupKey) || [];
    const pending = items.filter(e => !e.appliedInvoiceId);
    if (pending.length === 0) { toast({ title: 'Geen nieuwe regels in deze groep' }); return; }
    const sample = pending[0];
    const d = new Date(sample.usageDate);
    const w = sample.weekId || `${getYear(d)}-${getISOWeek(d)}`;
    const day = format(d, 'EEEE', { locale: nl });
    const plate = sample.licensePlate; const country = sample.country; const vat = sample.vatRate;
    const total = pending.reduce((acc, e) => acc + e.amount, 0);
    try {
      // Kenteken-check: factuur mag alleen tol krijgen van hetzelfde kenteken
      const inv = invoices.find(i => i.id === invoiceId) as any;
      const parseInvoicePlate = (invRef?: string) => {
        const m = String(invRef || '').match(/\(([A-Za-z0-9\-]+)\)\s*$/);
        return m ? m[1].toUpperCase() : '';
      };
      const invoicePlate = parseInvoicePlate(inv?.reference);
      if (invoicePlate && invoicePlate !== String(plate || '').toUpperCase()) {
        toast({ variant: 'destructive', title: 'Kenteken komt niet overeen', description: `Factuur: ${invoicePlate}. Geselecteerde groep kenteken: ${String(plate || '').toUpperCase()}. Koppelen afgebroken.` });
        return;
      }
      // Bestaande witregels laden
      const { data: invLines } = await supabase
        .from('invoice_lines')
        .select('id, description, quantity, unit_price, vat_rate')
        .eq('invoice_id', invoiceId);
      const blanks = (invLines || []).filter(l => (Number(l.unit_price) === 0) && (!l.quantity || Number(l.quantity) === 0) && String(l.description||'').toLowerCase().includes('tol')) as any[];

      const lower = country.toLowerCase();
            const label = lower.startsWith('de') ? 'Duitsland' : (lower.startsWith('be') ? 'België' : country);
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const yyyy = d.getFullYear();
      const dateLabel = `${dd}-${mm}-${yyyy}`;

      // Check if this toll group is already applied to ANY invoice
      const groupKey = `${w}|${day}|${plate}|${country}|${vat}`;
      const alreadyAppliedEntries = entries.filter(e => {
        if (e.appliedInvoiceId) {
          const d = new Date(e.usageDate);
          const w2 = e.weekId || `${getYear(d)}-${getISOWeek(d)}`;
          const day2 = format(d, 'EEEE', { locale: nl });
          const entryGroupKey = `${w2}|${day2}|${e.licensePlate}|${e.country}|${e.vatRate}`;
          return entryGroupKey === groupKey;
        }
        return false;
      });
      
      if (alreadyAppliedEntries.length > 0) {
        const invoiceIds = Array.from(new Set(alreadyAppliedEntries.map(e => e.appliedInvoiceId).filter(Boolean)));
        const invoiceLabels = invoiceIds.map(id => invoiceMap[id] || id).join(', ');
        toast({
          variant: "destructive",
          title: "Tol al toegevoegd",
          description: `Week ${w}, ${day}, ${country} (${vat}%) is al toegevoegd aan: ${invoiceLabels}`,
        });
        return;
      }
      
      // Check if exact match exists in current invoice
      const exactMatch = (invLines || []).find((l: any) => {
        const desc = String(l.description || '').toLowerCase();
        const hasDay = desc.includes(day.toLowerCase());
        const hasCountry = desc.includes(label.toLowerCase());
        const hasWeek = desc.includes(w.toLowerCase()) || desc.includes(dateLabel.toLowerCase());
        const hasVat = Number(l.vat_rate) === vat;
        const hasAmount = Number(l.unit_price) > 0 || Number(l.quantity) > 0;
        return hasDay && hasCountry && hasWeek && hasVat && hasAmount;
      });
      
      if (exactMatch) {
        toast({
          variant: "destructive",
          title: "Tol al in factuur",
          description: `Week ${w}, ${day}, ${country} (${vat}%) staat al in deze factuur.`,
        });
        return;
      }
      
      const match = blanks.find(l => {
        const desc = String(l.description||'').toLowerCase();
        return desc.includes(dateLabel.toLowerCase()) && desc.includes('tol');
      });
      const amount = Number(total.toFixed(2));
      if (match) {
        const { error } = await supabase.from('invoice_lines').update({ quantity: 1, unit_price: amount, vat_rate: vat, total: amount }).eq('id', match.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('invoice_lines').insert([{ invoice_id: invoiceId, quantity: 1, description: `${day} ${dateLabel}\nTol ${label}`, unit_price: amount, vat_rate: vat, total: amount }]);
        if (error) throw error;
      }

      const { error: upErr } = await supabase
        .from('toll_entries')
        .update({ applied_invoice_id: invoiceId, applied_at: new Date().toISOString() })
        .in('id', pending.map(p => p.id));
      if (upErr) throw upErr;
      
      // Refresh entries from database to ensure consistency
      await fetchEntries();
      setInvoiceMap(prev => ({
        ...prev,
        [invoiceId]: prev[invoiceId]
          || invoices.find(i => i.id === invoiceId)?.invoice_number
          || (invoices.find(i => i.id === invoiceId) as any)?.reference
          || invoiceId
      }));
      toast({ title: 'Groep toegevoegd', description: `Factuur bijgewerkt (${vat}%)` });
    } catch (e: any) {
      console.error('[Tol] apply group error', e);
      toast({ variant: 'destructive', title: 'Toevoegen mislukt', description: e?.message || String(e) });
    }
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
        const label = r.invoice_number || r.reference || r.id;
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
            {parsed.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm">Voorbeeld uit: {fileName} — {parsed.length} regels klaar voor import</div>
                  <Button onClick={handleImport} disabled={isImporting}>{isImporting ? "Bezig…" : "Importeer"}</Button>
                </div>
                <div className="border rounded-md overflow-auto max-h-[320px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                                          <TableHead>Datum</TableHead>
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
                        <TableRow key={idx}>
                          <TableCell>{format(new Date(r.usageDate), "dd-MM-yyyy")}</TableCell>
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
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Overzicht</h3>
            <div className="flex flex-wrap gap-3 items-center">
              {/* Use a non-empty sentinel for "all" to avoid Radix empty-value restriction */}
              <div className="w-[200px]">
                <Select value={filterWeek || "__ALL__"} onValueChange={(v) => setFilterWeek(v === "__ALL__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Week filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem key="all-weeks" value="__ALL__">Alle weken</SelectItem>
                    {recentWeeks.map((w) => (
                      <SelectItem key={w} value={w}>{w}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[200px]">
                <Select value={filterPlate || "__ALL__"} onValueChange={(v) => setFilterPlate(v === "__ALL__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kenteken" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem key="all-plates" value="__ALL__">Alle kentekens</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.licensePlate}>{v.licensePlate}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[280px]">
                <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kies conceptfactuur" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoices.map((inv) => {
                      const ref = inv.reference || '';
                      const dt = inv.created_at ? new Date(inv.created_at) : null;
                      const dateStr = dt ? dt.toLocaleDateString('nl-NL') : '';
                      const label = inv.invoice_number || (ref ? ref : `${dateStr} (${inv.id.slice(0, 8)})`);
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
                  disabled={!selectedInvoiceId || selectedIds.size === 0}
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
                      <TableHead className="w-6">
                        <Checkbox checked={(pendingAllSelected ? true : (pendingSomeSelected ? 'indeterminate' : false)) as any} onCheckedChange={(v) => handleSelectAllPending(v as any)} />
                      </TableHead>
                      <TableHead className="w-24">Week</TableHead>
                      <TableHead className="w-24">Dag</TableHead>
                      <TableHead className="w-28">Kenteken</TableHead>
                      <TableHead className="w-16">Land</TableHead>
                      <TableHead className="w-16 text-right">BTW %</TableHead>
                      <TableHead className="w-48">Factuur</TableHead>
                      <TableHead className="w-28 text-right">Totaal (ex)</TableHead>
                      <TableHead className="w-16 text-right">Aantal</TableHead>
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
                        return (
                        <TableRow key={`${g.weekId}-${g.day}-${g.licensePlate}-${g.country}-${g.vatRate}-${idx}`}>
                          <TableCell>
                            <Checkbox checked={checked} onCheckedChange={(v) => toggleGroupSelected(groupKey, v as any)} />
                          </TableCell>
                          <TableCell className="w-24">{g.weekId}</TableCell>
                          <TableCell className="w-24">{g.day}</TableCell>
                          <TableCell className="w-28">{g.licensePlate}</TableCell>
                          <TableCell className="w-16">{g.country}</TableCell>
                          <TableCell className="w-16 text-right">{g.vatRate}%</TableCell>
                          <TableCell className="w-48">-</TableCell>
                          <TableCell className="w-28 text-right">{formatCurrency(g.total)}</TableCell>
                          <TableCell className="w-16 text-right">{g.count}</TableCell>
                        </TableRow>
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
                      <TableHead className="w-6">
                        <Checkbox checked={(appliedAllSelected ? true : (appliedSomeSelected ? 'indeterminate' : false)) as any} onCheckedChange={(v) => handleSelectAllApplied(v as any)} />
                      </TableHead>
                      <TableHead className="w-24">Week</TableHead>
                      <TableHead className="w-24">Dag</TableHead>
                      <TableHead className="w-28">Kenteken</TableHead>
                      <TableHead className="w-16">Land</TableHead>
                      <TableHead className="w-16 text-right">BTW %</TableHead>
                      <TableHead className="w-48">Factuur</TableHead>
                      <TableHead className="w-28 text-right">Totaal (ex)</TableHead>
                      <TableHead className="w-16 text-right">Aantal</TableHead>
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
                        return (
                        <TableRow key={`applied-${g.weekId}-${g.day}-${g.licensePlate}-${g.country}-${g.vatRate}-${idx}`}>
                          <TableCell>
                            <Checkbox checked={checked} onCheckedChange={(v) => toggleGroupSelected(groupKey, v as any)} />
                          </TableCell>
                          <TableCell className="w-24">{g.weekId}</TableCell>
                          <TableCell className="w-24">{g.day}</TableCell>
                          <TableCell className="w-28">{g.licensePlate}</TableCell>
                          <TableCell className="w-16">{g.country}</TableCell>
                          <TableCell className="w-16 text-right">{g.vatRate}%</TableCell>
                          <TableCell>{(!labels || labels.length === 0) ? '-' : (labels.length === 1 ? labels[0] : `Meerdere (${labels.join(', ')})`)}</TableCell>
                          <TableCell className="w-28 text-right">{formatCurrency(g.total)}</TableCell>
                          <TableCell className="w-16 text-right">{g.count}</TableCell>
                        </TableRow>
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
















































