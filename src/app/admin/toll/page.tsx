"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import { Ban, Loader2, Play, RefreshCw, UploadCloud } from "lucide-react";

type TollDashboard = {
  matched: Array<{
    license_plate: string;
    transaction_date: string;
    amount: number;
    invoice_line_id: string;
    invoice_id?: string;
    invoice_reference?: string | null;
  }>;
  unmatched: Array<{
    license_plate: string;
    transaction_date: string;
    amount: number;
    count: number;
    txIds: string[];
    week_id: string;
    reason: string;
    suggested_invoice_id?: string;
    suggested_invoice_reference?: string | null;
  }>;
  missingToll: Array<{
    invoice_id: string;
    invoice_reference: string | null;
    invoice_line_id: string;
    dateLabel: string;
    license_plate: string;
  }>;
  weekOverview: Array<{
    week_id: string;
    license_plate: string;
    matched_amount: number;
    unmatched_amount: number;
    missing_toll_count: number;
    ok: boolean;
  }>;
};

const formatCurrency = (amount: number) =>
  `€ ${Number(amount || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

async function authedFetch(input: RequestInfo, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Niet ingelogd (geen sessie token).");
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

type ColumnMapping = {
  license_plate?: string;
  transaction_date?: string;
  transaction_time?: string;
  amount?: string;
  country?: string;
  vat_rate?: string;
};

const SELECT_NONE_VALUE = "__none__";

async function readHeaderRow(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1 }) as any[][];
  const header = raw?.[0] || [];
  return (header as any[]).map((h) => String(h ?? "").trim()).filter((h) => h.length > 0);
}

export default function TollAdminPage() {
  const { toast } = useToast();

  const [dashboard, setDashboard] = useState<TollDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [mappingReady, setMappingReady] = useState(false);

  // Manual matching UI
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTarget, setManualTarget] = useState<TollDashboard["unmatched"][number] | null>(null);
  const [conceptInvoices, setConceptInvoices] = useState<
    Array<{ id: string; reference: string | null; invoice_date: string | null; toll_status?: string; open_toll_lines?: number }>
  >([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [invoiceFilter, setInvoiceFilter] = useState<string>("");

  // Table filters
  const [weekFilterWeek, setWeekFilterWeek] = useState("");
  const [weekFilterPlate, setWeekFilterPlate] = useState("");
  const [weekFilterStatus, setWeekFilterStatus] = useState<"all" | "ok" | "controle">("all");

  const [matchedFilter, setMatchedFilter] = useState("");
  const [matchedFilterPlate, setMatchedFilterPlate] = useState("");

  const [missingFilter, setMissingFilter] = useState("");
  const [missingFilterPlate, setMissingFilterPlate] = useState("");

  const totals = useMemo(() => {
    const matched = (dashboard?.matched || []).reduce((acc, m) => acc + Number(m.amount || 0), 0);
    const unmatched = (dashboard?.unmatched || []).reduce((acc, u) => acc + Number(u.amount || 0), 0);
    return { matched, unmatched };
  }, [dashboard]);

  const filteredWeekOverview = useMemo(() => {
    const rows = dashboard?.weekOverview || [];
    const wq = weekFilterWeek.trim().toLowerCase();
    const pq = weekFilterPlate.trim().toLowerCase();
    return rows.filter((r) => {
      if (wq && !String(r.week_id || "").toLowerCase().includes(wq)) return false;
      if (pq && !String(r.license_plate || "").toLowerCase().includes(pq)) return false;
      if (weekFilterStatus === "ok" && !r.ok) return false;
      if (weekFilterStatus === "controle" && r.ok) return false;
      return true;
    });
  }, [dashboard, weekFilterWeek, weekFilterPlate, weekFilterStatus]);

  const filteredMatched = useMemo(() => {
    const rows = dashboard?.matched || [];
    const q = matchedFilter.trim().toLowerCase();
    const pq = matchedFilterPlate.trim().toLowerCase();
    return rows.filter((r) => {
      if (pq && !String(r.license_plate || "").toLowerCase().includes(pq)) return false;
      if (!q) return true;
      const hay = `${r.transaction_date} ${r.license_plate} ${r.invoice_reference || ""} ${r.invoice_id || ""} ${r.invoice_line_id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [dashboard, matchedFilter, matchedFilterPlate]);

  const filteredMissing = useMemo(() => {
    const rows = dashboard?.missingToll || [];
    const q = missingFilter.trim().toLowerCase();
    const pq = missingFilterPlate.trim().toLowerCase();
    return rows.filter((r) => {
      if (pq && !String(r.license_plate || "").toLowerCase().includes(pq)) return false;
      if (!q) return true;
      const hay = `${r.dateLabel} ${r.license_plate} ${r.invoice_reference || ""} ${r.invoice_id} ${r.invoice_line_id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [dashboard, missingFilter, missingFilterPlate]);

  const loadConceptInvoices = async () => {
    if (loadingInvoices) return;
    setLoadingInvoices(true);
    try {
      // Only show concept invoices that are in "tol toevoegen" state (have blank toll placeholder lines)
      const res = await authedFetch("/api/admin/toll/concept-invoices?needsToll=1&limit=300", { method: "GET" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.details || json?.error || "Conceptfacturen laden mislukt");
      const invs = (json?.invoices || []) as any[];
      setConceptInvoices(
        invs.map((r: any) => ({
          id: r.id,
          reference: r.reference || null,
          invoice_date: r.invoice_date || null,
          toll_status: r.toll_status || null,
          open_toll_lines: typeof r.open_toll_lines === "number" ? r.open_toll_lines : undefined,
        }))
      );
    } catch (e: any) {
      console.error("[TOLL] loadConceptInvoices error", e);
      toast({ variant: "destructive", title: "Conceptfacturen laden mislukt", description: e?.message || String(e) });
    } finally {
      setLoadingInvoices(false);
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/admin/toll/dashboard?daysBack=120", { method: "GET" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as TollDashboard;
      setDashboard(data);
    } catch (e: any) {
      console.error("[TOLL] dashboard error", e);
      toast({ variant: "destructive", title: "Dashboard laden mislukt", description: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setImportResult(null);
    try {
      if (!columnMapping.license_plate || !columnMapping.transaction_date || !columnMapping.amount) {
        throw new Error("Kies eerst de kolommen voor Kenteken, Datum en Bedrag.");
      }
      const fd = new FormData();
      fd.set("file", file);
      fd.set(
        "column_mapping",
        JSON.stringify({
          license_plate: columnMapping.license_plate,
          transaction_date: columnMapping.transaction_date,
          amount: columnMapping.amount,
          transaction_time: columnMapping.transaction_time || undefined,
          country: columnMapping.country || undefined,
          vat_rate: columnMapping.vat_rate || undefined,
        })
      );
      const res = await authedFetch("/api/admin/toll/import", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.details || json?.error || "Import failed");
      setImportResult(json);
      toast({ title: "Import afgerond", description: `Nieuw: ${json.insertedRows}, duplicaten: ${json.skippedDuplicates}` });
      await loadDashboard();
    } catch (e: any) {
      console.error("[TOLL] import error", e);
      toast({ variant: "destructive", title: "Import mislukt", description: e?.message || String(e) });
    } finally {
      setUploading(false);
    }
  };

  const ignoreTxIds = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const res = await authedFetch("/api/admin/toll/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setStatus", ids, status: "ignored" }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Genegeerd", description: `${ids.length} transactie(s) gemarkeerd als ignored` });
      await loadDashboard();
    } catch (e: any) {
      console.error("[TOLL] ignore error", e);
      toast({ variant: "destructive", title: "Negeren mislukt", description: e?.message || String(e) });
    }
  };

  const openManualMatch = async (u: TollDashboard["unmatched"][number]) => {
    setManualTarget(u);
    setSelectedInvoiceId(u.suggested_invoice_id || "");
    setInvoiceFilter("");
    setManualOpen(true);
    if (conceptInvoices.length === 0) {
      await loadConceptInvoices();
    }
  };

  const doManualMatch = async () => {
    if (!manualTarget) return;
    if (!selectedInvoiceId) {
      toast({ variant: "destructive", title: "Kies een factuur", description: "Selecteer eerst een conceptfactuur." });
      return;
    }
    try {
      const res = await authedFetch("/api/admin/toll/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "matchManual", ids: manualTarget.txIds, invoiceId: selectedInvoiceId, createIfMissing: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.details || json?.error || "Koppelen mislukt");
      toast({
        title: "Gekoppeld",
        description: `Tolregel bijgewerkt: ${formatCurrency(json.total)} (${json.invoice_reference || selectedInvoiceId}) · Status: ${
          json.toll_status || "-"
        }`,
      });
      setManualOpen(false);
      setManualTarget(null);
      await loadConceptInvoices(); // refresh list so invoices disappear when no open toll lines remain
      await loadDashboard();
    } catch (e: any) {
      console.error("[TOLL] manual match error", e);
      toast({ variant: "destructive", title: "Koppelen mislukt", description: e?.message || String(e) });
    }
  };

  const runReconcile = async () => {
    try {
      const res = await authedFetch("/api/admin/toll/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconcile" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.details || json?.error || "Afstemmen mislukt");
      toast({ title: "Afstemming uitgevoerd", description: `Gekoppeld: ${json.reconcile?.matchedTransactions || 0}` });
      await loadDashboard();
    } catch (e: any) {
      console.error("[TOLL] reconcile error", e);
      toast({ variant: "destructive", title: "Afstemmen mislukt", description: e?.message || String(e) });
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Tolbeheer – Matchen &amp; Afstemmen</CardTitle>
          <CardDescription>
            Upload tol-export (Excel) → dubbele uploads worden overgeslagen → transacties worden automatisch gematcht met conceptfacturen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              Gekoppeld totaal: <span className="font-medium text-foreground">{formatCurrency(totals.matched)}</span> · Niet gekoppeld totaal:{" "}
              <span className="font-medium text-foreground">{formatCurrency(totals.unmatched)}</span> · Ontbrekende tol:{" "}
              <span className="font-medium text-foreground">{dashboard?.missingToll?.length ?? 0}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadDashboard} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2">Ververs</span>
              </Button>
              <Button variant="outline" onClick={runReconcile}>
                <Play className="h-4 w-4 mr-2" />
                Opnieuw afstemmen
              </Button>
            </div>
          </div>

          <Tabs defaultValue="upload">
            <TabsList>
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="week">Per week</TabsTrigger>
              <TabsTrigger value="matched">Gekoppeld</TabsTrigger>
              <TabsTrigger value="unmatched">Niet gekoppeld</TabsTrigger>
              <TabsTrigger value="missing">Ontbrekende tol</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4">
              <div className="rounded-md border p-4 space-y-3">
                <div className="text-sm font-medium">Excel upload</div>
                <div className="text-sm text-muted-foreground">
                  Kies een bestand, map de kolommen, en importeer. Tijdstip is optioneel, maar aanbevolen voor betere duplicate-detectie.
                </div>
                <div className="flex flex-col md:flex-row gap-3 md:items-center">
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setSelectedFile(f);
                        setImportResult(null);
                        setMappingReady(false);
                        setColumnMapping({});
                        void readHeaderRow(f)
                          .then((headers) => {
                            setFileHeaders(headers);
                            if (headers.length === 0) {
                              toast({
                                variant: "destructive",
                                title: "Geen headers gevonden",
                                description: "Kon geen header-rij (eerste rij) lezen uit het bestand.",
                              });
                            }
                          })
                          .catch((err) => {
                            console.error("[TOLL] readHeaderRow error", err);
                            toast({ variant: "destructive", title: "Bestand lezen mislukt", description: err?.message || String(err) });
                          });
                      }
                      e.currentTarget.value = "";
                    }}
                  />
                </div>

                {selectedFile && fileHeaders.length > 0 && (
                  <div className="rounded-md border p-4 space-y-4">
                    <div className="text-sm font-medium">Kolom mapping</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>
                          Kenteken <span className="text-red-500">*</span>
                        </Label>
                        <Select
                          value={columnMapping.license_plate || SELECT_NONE_VALUE}
                          onValueChange={(v) => setColumnMapping((prev) => ({ ...prev, license_plate: v === SELECT_NONE_VALUE ? undefined : v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Kies kolom" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SELECT_NONE_VALUE}>-</SelectItem>
                            {fileHeaders.map((h) => (
                              <SelectItem key={`lp-${h}`} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>
                          Datum <span className="text-red-500">*</span>
                        </Label>
                        <Select
                          value={columnMapping.transaction_date || SELECT_NONE_VALUE}
                          onValueChange={(v) =>
                            setColumnMapping((prev) => ({ ...prev, transaction_date: v === SELECT_NONE_VALUE ? undefined : v }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Kies kolom" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SELECT_NONE_VALUE}>-</SelectItem>
                            {fileHeaders.map((h) => (
                              <SelectItem key={`dt-${h}`} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>
                          Bedrag <span className="text-red-500">*</span>
                        </Label>
                        <Select
                          value={columnMapping.amount || SELECT_NONE_VALUE}
                          onValueChange={(v) => setColumnMapping((prev) => ({ ...prev, amount: v === SELECT_NONE_VALUE ? undefined : v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Kies kolom" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SELECT_NONE_VALUE}>-</SelectItem>
                            {fileHeaders.map((h) => (
                              <SelectItem key={`am-${h}`} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>
                          Tijdstip <span className="text-muted-foreground">(aanbevolen)</span>
                        </Label>
                        <Select
                          value={columnMapping.transaction_time || SELECT_NONE_VALUE}
                          onValueChange={(v) =>
                            setColumnMapping((prev) => ({ ...prev, transaction_time: v === SELECT_NONE_VALUE ? undefined : v }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="(optioneel)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SELECT_NONE_VALUE}>-</SelectItem>
                            {fileHeaders.map((h) => (
                              <SelectItem key={`tm-${h}`} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Land (optioneel)</Label>
                        <Select
                          value={columnMapping.country || SELECT_NONE_VALUE}
                          onValueChange={(v) => setColumnMapping((prev) => ({ ...prev, country: v === SELECT_NONE_VALUE ? undefined : v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="(optioneel)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SELECT_NONE_VALUE}>-</SelectItem>
                            {fileHeaders.map((h) => (
                              <SelectItem key={`ct-${h}`} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>BTW % (optioneel)</Label>
                        <Select
                          value={columnMapping.vat_rate || SELECT_NONE_VALUE}
                          onValueChange={(v) => setColumnMapping((prev) => ({ ...prev, vat_rate: v === SELECT_NONE_VALUE ? undefined : v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="(optioneel)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SELECT_NONE_VALUE}>-</SelectItem>
                            {fileHeaders.map((h) => (
                              <SelectItem key={`vat-${h}`} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="text-sm text-muted-foreground">
                        {columnMapping.license_plate && columnMapping.transaction_date && columnMapping.amount
                          ? "Mapping is klaar. Je kunt importeren."
                          : "Vul minimaal Kenteken, Datum en Bedrag in."}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedFile(null);
                            setFileHeaders([]);
                            setColumnMapping({});
                            setMappingReady(false);
                            setImportResult(null);
                          }}
                          disabled={uploading}
                        >
                          Annuleren
                        </Button>
                        <Button
                          variant="default"
                          disabled={
                            uploading ||
                            !selectedFile ||
                            !columnMapping.license_plate ||
                            !columnMapping.transaction_date ||
                            !columnMapping.amount
                          }
                          onClick={() => {
                            setMappingReady(true);
                            if (selectedFile) void handleUpload(selectedFile);
                          }}
                        >
                          {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UploadCloud className="h-4 w-4 mr-2" />}
                          Importeren
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {importResult && (
                  <div className="text-sm">
                    Parsed: <span className="font-medium">{importResult.parsedRows}</span> · Inserted:{" "}
                    <span className="font-medium">{importResult.insertedRows}</span> · Duplicates skipped:{" "}
                    <span className="font-medium">{importResult.skippedDuplicates}</span> · Gekoppeld:{" "}
                    <span className="font-medium">{importResult.reconcile?.matchedTransactions ?? 0}</span>
                  </div>
                )}
                {importResult?.warnings?.length > 0 && (
                  <div className="text-sm text-amber-700">
                    <div className="font-medium">Let op</div>
                    <ul className="list-disc ml-5">
                      {importResult.warnings.map((w: string, idx: number) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="week" className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                  <div className="space-y-2">
                    <Label>Week</Label>
                    <Input value={weekFilterWeek} onChange={(e) => setWeekFilterWeek(e.target.value)} placeholder="bijv. 2026-01" />
                  </div>
                  <div className="space-y-2">
                    <Label>Kenteken</Label>
                    <Input value={weekFilterPlate} onChange={(e) => setWeekFilterPlate(e.target.value)} placeholder="bijv. 98-BPX-9" />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={weekFilterStatus} onValueChange={(v) => setWeekFilterStatus(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle</SelectItem>
                        <SelectItem value="ok">OK</SelectItem>
                        <SelectItem value="controle">Controle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                  {filteredWeekOverview.length} / {dashboard?.weekOverview?.length ?? 0}
                </div>
              </div>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px] whitespace-nowrap">Week</TableHead>
                      <TableHead className="w-[110px] whitespace-nowrap">Kenteken</TableHead>
                        <TableHead className="w-[130px] text-right whitespace-nowrap">Gekoppeld</TableHead>
                        <TableHead className="w-[130px] text-right whitespace-nowrap">Niet gekoppeld</TableHead>
                      <TableHead className="w-[120px] text-right whitespace-nowrap">Missing toll</TableHead>
                      <TableHead className="w-[120px] whitespace-nowrap">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          Laden...
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && filteredWeekOverview.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          Geen resultaten.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredWeekOverview.slice(0, 500).map((w) => (
                      <TableRow key={`${w.week_id}-${w.license_plate}`}>
                        <TableCell className="font-medium whitespace-nowrap">{w.week_id}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{w.license_plate}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatCurrency(w.matched_amount)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatCurrency(w.unmatched_amount)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{w.missing_toll_count}</TableCell>
                        <TableCell className="whitespace-nowrap">{w.ok ? "OK" : "Controle"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="matched" className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                  <div className="space-y-2">
                    <Label>Kenteken</Label>
                      <Input value={matchedFilterPlate} onChange={(e) => setMatchedFilterPlate(e.target.value)} placeholder="filter op kenteken" />
                  </div>
                  <div className="space-y-2">
                    <Label>Zoeken</Label>
                      <Input value={matchedFilter} onChange={(e) => setMatchedFilter(e.target.value)} placeholder="datum / kenmerk / factuur-id" />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                  {filteredMatched.length} / {dashboard?.matched?.length ?? 0}
                </div>
              </div>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px] whitespace-nowrap">Datum</TableHead>
                      <TableHead className="w-[110px] whitespace-nowrap">Kenteken</TableHead>
                      <TableHead className="w-[120px] text-right whitespace-nowrap">Bedrag</TableHead>
                      <TableHead>Factuur kenmerk</TableHead>
                      <TableHead className="w-[240px] whitespace-nowrap">Factuurregel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                          Laden...
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && filteredMatched.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                          Geen resultaten.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredMatched.slice(0, 500).map((m, idx) => (
                      <TableRow key={`${m.invoice_line_id}-${idx}`}>
                        <TableCell className="whitespace-nowrap">{m.transaction_date}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{m.license_plate}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatCurrency(m.amount)}</TableCell>
                        <TableCell className="text-sm">
                          <div className="max-w-[800px] whitespace-normal">{m.invoice_reference || m.invoice_id || "-"}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{m.invoice_line_id}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="unmatched" className="space-y-4">
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px] whitespace-nowrap">Week</TableHead>
                      <TableHead className="w-[120px] whitespace-nowrap">Datum</TableHead>
                      <TableHead className="w-[110px] whitespace-nowrap">Kenteken</TableHead>
                      <TableHead className="w-[120px] text-right whitespace-nowrap">Bedrag</TableHead>
                      <TableHead className="w-[80px] text-right whitespace-nowrap">Regels</TableHead>
                      <TableHead>Reden</TableHead>
                      <TableHead className="w-[240px] text-right whitespace-nowrap">Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          Laden...
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && (dashboard?.unmatched?.length || 0) === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          Geen unmatched transacties.
                        </TableCell>
                      </TableRow>
                    )}
                    {(dashboard?.unmatched || []).slice(0, 500).map((u) => (
                      <TableRow key={`${u.license_plate}-${u.transaction_date}`}>
                        <TableCell className="font-medium whitespace-nowrap align-top">{u.week_id}</TableCell>
                        <TableCell className="whitespace-nowrap align-top">{u.transaction_date}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap align-top">{u.license_plate}</TableCell>
                        <TableCell className="text-right whitespace-nowrap align-top tabular-nums">{formatCurrency(u.amount)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap align-top tabular-nums">{u.count}</TableCell>
                        <TableCell className="text-sm text-muted-foreground align-top">
                          <div className="max-w-[700px] whitespace-normal">{u.reason}</div>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="flex justify-end gap-2 whitespace-nowrap">
                            <Button size="sm" variant="outline" onClick={() => void openManualMatch(u)}>
                              Koppel aan factuur
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void ignoreTxIds(u.txIds)}>
                              <Ban className="h-4 w-4 mr-2" />
                              Negeren
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="missing" className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                  <div className="space-y-2">
                    <Label>Kenteken</Label>
                      <Input value={missingFilterPlate} onChange={(e) => setMissingFilterPlate(e.target.value)} placeholder="filter op kenteken" />
                  </div>
                  <div className="space-y-2">
                    <Label>Zoeken</Label>
                      <Input value={missingFilter} onChange={(e) => setMissingFilter(e.target.value)} placeholder="datum / kenmerk / factuur-id" />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                  {filteredMissing.length} / {dashboard?.missingToll?.length ?? 0}
                </div>
              </div>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px] whitespace-nowrap">Datum</TableHead>
                      <TableHead className="w-[110px] whitespace-nowrap">Kenteken</TableHead>
                      <TableHead>Factuur</TableHead>
                      <TableHead className="w-[240px] whitespace-nowrap">Factuurregel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                          Laden...
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && filteredMissing.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                          Geen resultaten.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredMissing.slice(0, 500).map((m) => (
                      <TableRow key={m.invoice_line_id}>
                        <TableCell className="whitespace-nowrap">{m.dateLabel}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{m.license_plate}</TableCell>
                        <TableCell className="text-sm">
                          <div className="max-w-[800px] whitespace-normal">{m.invoice_reference || m.invoice_id}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{m.invoice_line_id}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog
        open={manualOpen}
        onOpenChange={(open) => {
          setManualOpen(open);
          if (!open) {
            setManualTarget(null);
            setSelectedInvoiceId("");
            setInvoiceFilter("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Koppel unmatched tol aan conceptfactuur</DialogTitle>
            <DialogDescription>
              Kies handmatig de juiste factuur. We zoeken (of maken) een tolregel voor deze datum en koppelen alle transacties uit deze groep.
            </DialogDescription>
          </DialogHeader>

          {manualTarget && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <div>
                  <span className="font-medium">Week:</span> {manualTarget.week_id} · <span className="font-medium">Kenteken:</span>{" "}
                  {manualTarget.license_plate} · <span className="font-medium">Datum:</span> {manualTarget.transaction_date}
                </div>
                <div>
                  <span className="font-medium">Bedrag:</span> {formatCurrency(manualTarget.amount)} · <span className="font-medium">Regels:</span>{" "}
                  {manualTarget.count}
                </div>
                <div className="text-muted-foreground mt-2">
                  <span className="font-medium text-foreground">Reden:</span> {manualTarget.reason}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Filter (bijv. week/kenteken)</Label>
                  <Input value={invoiceFilter} onChange={(e) => setInvoiceFilter(e.target.value)} placeholder="Week 05 - 2026 (AB-12-CD)" />
                </div>
                <div className="space-y-2">
                  <Label>Conceptfactuur</Label>
                  <Select value={selectedInvoiceId || SELECT_NONE_VALUE} onValueChange={(v) => setSelectedInvoiceId(v === SELECT_NONE_VALUE ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Kies factuur" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_NONE_VALUE}>-</SelectItem>
                      {conceptInvoices
                        .filter((inv) => {
                          if (!invoiceFilter.trim()) return true;
                          const hay = `${inv.reference || ""} ${inv.id}`.toLowerCase();
                          return hay.includes(invoiceFilter.trim().toLowerCase());
                        })
                        .slice(0, 200)
                        .map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.reference || inv.id}
                            {inv.open_toll_lines != null ? ` — ${inv.toll_status || ""} (${inv.open_toll_lines})` : inv.toll_status ? ` — ${inv.toll_status}` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    {loadingInvoices ? "Conceptfacturen laden..." : `Aantal conceptfacturen: ${conceptInvoices.length}`}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              Sluiten
            </Button>
            <Button onClick={() => void doManualMatch()} disabled={!manualTarget || !selectedInvoiceId}>
              Koppelen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

