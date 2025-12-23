
"use client";

import { useState, useEffect, useMemo } from 'react';
import type { Invoice, Customer, Supplier, PurchaseInvoice } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';
import { mapSupabaseToApp } from '@/lib/utils';
import { DateRange } from "react-day-picker";
import { startOfQuarter, endOfQuarter, parseISO, isPast, addMonths, startOfMonth, format, differenceInDays } from 'date-fns';
import { nl } from 'date-fns/locale';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { Circle, Info, PlusCircle, MinusCircle } from 'lucide-react';
import Link from 'next/link';
import { DateRangePicker } from '@/components/DateRangePicker';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const formatCurrency = (value: number | undefined) => {
  if (value === undefined || isNaN(value)) return '-';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
};

const formatNumberValue = (value: number | undefined, digits = 2) => {
  if (value === undefined || isNaN(value)) return '-';
  return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
};

const ReportCard = ({ title, link, value, children }: { title: string, link?: string, value: React.ReactNode, children: React.ReactNode }) => (
    <Card className="flex-1">
        <CardHeader className="pb-4">
            <CardTitle className="text-xl flex justify-between items-center">
                 {link ? <Link href={link} className="hover:underline">{title}</Link> : title}
                <span className="text-2xl font-bold text-primary">{value}</span>
            </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
            {children}
        </CardContent>
    </Card>
);

const ReportRow = ({ icon: Icon, color, label, value }: { icon: React.ElementType, color: string, label: string, value: React.ReactNode }) => (
    <div className="flex justify-between items-center border-t py-2">
        <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", color)} />
            <span className="text-muted-foreground">{label}</span>
        </div>
        <span className="font-medium">{value}</span>
    </div>
);

const RankedList = ({ title, link, value, items, type }: { title: string, link?: string, value: React.ReactNode, items: {name: string, amount: number}[], type: 'debit' | 'credit' }) => (
    <Card className="flex-1">
        <CardHeader className="pb-4">
            <CardTitle className="text-xl flex justify-between items-center">
                 {link ? <Link href={link} className="hover:underline">{title}</Link> : title}
            </CardTitle>
            <CardDescription className="flex justify-between items-center">
                <span>{type === 'debit' ? 'Te ontvangen' : 'Te betalen'}</span>
                <span className="text-lg font-bold text-foreground">{value}</span>
            </CardDescription>
        </CardHeader>
        <CardContent>
            <ol className="space-y-2 text-sm">
                {items.slice(0, 3).map((item, index) => (
                    <li key={item.name} className="flex justify-between">
                        <span>{index + 1}. {item.name}</span>
                        <span className="font-mono">{formatCurrency(item.amount)}</span>
                    </li>
                ))}
                 {items.length > 3 && (
                    <li className="flex justify-between">
                        <span>4. Overige</span>
                        <span className="font-mono">{formatCurrency(items.slice(3).reduce((acc, i) => acc + i.amount, 0))}</span>
                    </li>
                )}
            </ol>
        </CardContent>
    </Card>
);

type CounterpartyItem = {
    name: string;
    amount: number;
    invoiceCount: number;
    avgDays: number;
};

type MonthInfo = { key: string; label: string };
type MonthlySnapshot = MonthInfo & { omzet: number; kosten: number; resultaat: number };
type VatBucket = { base: number; tax: number };
type VatBreakdown = Record<'high' | 'low' | 'zero', VatBucket>;
type RevenuePerCustomer = { name: string; perMonth: Record<string, number>; total: number };
type PurchaseInvoiceWithSupplier = PurchaseInvoice & { supplierId?: string; vatTotal?: number; subTotal?: number };
type CustomerMetric = {
    customerId: string | null;
    name: string;
    totalHours: number;
    hourRevenue: number;
    totalKm: number;
    kmRevenue: number;
    avgHourRate: number;
    avgKmRate: number;
};

interface PeriodDataShape {
    omzet: number;
    kosten: number;
    winst: number;
    teBetalenBtw: number;
    teVorderenBtw: number;
    btwBalans: number;
    banksaldo: number;
    teOntvangen: number;
    teBetalen: number;
    werkkapitaal: number;
    beginsaldo: number;
    bijgeschreven: number;
    afgeschreven: number;
    debiteurenLijst: CounterpartyItem[];
    crediteurenLijst: CounterpartyItem[];
    months: MonthInfo[];
    monthlySummary: MonthlySnapshot[];
    vatBreakdown: VatBreakdown;
    revenuePerCustomer: RevenuePerCustomer[];
    customerMetrics: CustomerMetric[];
    bestKmCustomer: CustomerMetric | null;
    bestHourCustomer: CustomerMetric | null;
}

const createEmptyPeriodData = (): PeriodDataShape => ({
    omzet: 0,
    kosten: 0,
    winst: 0,
    teBetalenBtw: 0,
    teVorderenBtw: 0,
    btwBalans: 0,
    banksaldo: 0,
    teOntvangen: 0,
    teBetalen: 0,
    werkkapitaal: 0,
    beginsaldo: 0,
    bijgeschreven: 0,
    afgeschreven: 0,
    debiteurenLijst: [],
    crediteurenLijst: [],
    months: [],
    monthlySummary: [],
    vatBreakdown: {
        high: { base: 0, tax: 0 },
        low: { base: 0, tax: 0 },
        zero: { base: 0, tax: 0 },
    },
    revenuePerCustomer: [],
    customerMetrics: [],
    bestKmCustomer: null,
    bestHourCustomer: null,
});

const KM_KEYWORDS = ['kilometer', 'kilometers', ' km', 'km ', 'diesel', 'dot'];
const HOUR_KEYWORDS = ['uren', 'uur'];

const isKmDescription = (description: string | undefined) => {
    const s = (description || '').toLowerCase();
    return KM_KEYWORDS.some(keyword => s.includes(keyword));
};

const isHourDescription = (description: string | undefined) => {
    const s = (description || '').toLowerCase();
    return HOUR_KEYWORDS.some(keyword => s.includes(keyword));
};


export default function RevenuePage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfQuarter(new Date()),
        to: endOfQuarter(new Date()),
    });
    
    const [salesInvoices, setSalesInvoices] = useState<Invoice[]>([]);
    const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoiceWithSupplier[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [financials, setFinancials] = useState<{startBalance: number, startDate: string} | null>(null);

    const [loading, setLoading] = useState(true);
    const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
    const updateCustomerSelection = (id: string, checked: boolean) => {
        setSelectedCustomers(prev => {
            if (checked) {
                return prev.includes(id) ? prev : [...prev, id];
            }
            return prev.filter(c => c !== id);
        });
    };
    const clearCustomerSelection = () => setSelectedCustomers([]);
    const reportSections = [
        { id: 'overview', label: 'Overzicht' },
        { id: 'result', label: 'Resultatenrekening' },
        { id: 'vat', label: 'BTW-overzicht' },
        { id: 'debtors', label: 'Debiteurenoverzicht' },
        { id: 'creditors', label: 'Crediteurenoverzicht' },
        { id: 'revenue', label: 'Omzet per klant' },
        { id: 'customerTotals', label: 'Totaal per klant' },
    ] as const;
    const [activeReport, setActiveReport] = useState<typeof reportSections[number]['id']>('overview');

    useEffect(() => {
        setLoading(true);

        let active = true;

        const fetchAll = async () => {
            try {
                // Limit queries for better performance
                const [invRes, piRes, custRes, supRes, finRes] = await Promise.all([
                    supabase.from('invoices').select('*, invoice_lines(*)').order('created_at', { ascending: false }).limit(1000),
                    supabase.from('purchase_invoices').select('*').order('created_at', { ascending: false }).limit(1000),
                    supabase.from('customers').select('id, company_name, mileage_rate_type'),
                    supabase.from('suppliers').select('id, company_name'),
                    supabase.from('financial_settings').select('*').eq('id', 'main').maybeSingle(),
                ]);

                if (!active) return;

                if (!invRes.error) {
                    const mapped = (invRes.data || []).map(r => {
                        const base = mapSupabaseToApp(r) as any;
                        const rawLines: any[] = Array.isArray(base.lines)
                            ? base.lines
                            : Array.isArray(base.invoiceLines)
                                ? base.invoiceLines
                                : Array.isArray(r.invoice_lines)
                                    ? r.invoice_lines
                                    : [];
                        const lines = rawLines.map((line: any) => {
                            const quantity = Number(line.quantity ?? line.qty ?? 0) || 0;
                            const unitPrice = Number(line.unitPrice ?? line.unit_price ?? 0) || 0;
                            const total = Number(line.total ?? quantity * unitPrice) || 0;
                            const vatRate = Number(line.vatRate ?? line.vat_rate ?? 0) || 0;
                            return {
                                quantity,
                                description: line.description || '',
                                unitPrice,
                                vatRate,
                                total,
                                licensePlate: line.licensePlate || line.license_plate || undefined,
                            };
                        });
                        const invoice: Invoice = {
                            ...base,
                            id: r.id,
                            lines,
                            subTotal: typeof base.subTotal === 'number' ? base.subTotal : Number(base.subTotal ?? base.subtotal ?? 0),
                            vatTotal: typeof base.vatTotal === 'number' ? base.vatTotal : Number(base.vatTotal ?? base.vat_total ?? 0),
                            grandTotal: typeof base.grandTotal === 'number' ? base.grandTotal : Number(base.grandTotal ?? base.total ?? 0),
                        };
                        return invoice;
                    }) as Invoice[];
                    setSalesInvoices(mapped);
                }
                if (!piRes.error) {
                    const mapped = (piRes.data || []).map(r => ({
                        id: r.id,
                        kenmerk: r.kenmerk || '',
                        supplierName: r.supplier_name || '',
                        supplierId: r.supplier_id || undefined,
                        invoiceDate: r.invoice_date || new Date().toISOString(),
                        dueDate: r.due_date || r.invoice_date || new Date().toISOString(),
                        status: r.status,
                        grandTotal: Number(r.total ?? r.grand_total ?? 0),
                        createdAt: r.created_at || r.invoice_date || new Date().toISOString(),
                        category: r.category || undefined,
                        aiResult: r.ai_result || undefined,
                        vatTotal: typeof r.vat_total === 'number' ? Number(r.vat_total) : undefined,
                        subTotal: typeof r.sub_total === 'number'
                            ? Number(r.sub_total)
                            : (typeof r.total === 'number' && typeof r.vat_total === 'number'
                                ? Number(r.total) - Number(r.vat_total)
                                : Number(r.total ?? 0)),
                    })) as PurchaseInvoiceWithSupplier[];
                    setPurchaseInvoices(mapped);
                }
                if (!custRes.error) setCustomers(((custRes.data || []).map(r => { const base = mapSupabaseToApp(r) as any; return { ...base, id: r.id } as Customer; }) as Customer[]));
                if (!supRes.error) setSuppliers(((supRes.data || []).map(r => { const base = mapSupabaseToApp(r) as any; return { ...base, id: r.id } as Supplier; }) as Supplier[]));
                if (!finRes.error && finRes.data) setFinancials({ startBalance: Number(finRes.data.start_balance || 0), startDate: finRes.data.start_date || new Date(0).toISOString() });

                setLoading(false);
            } catch (e) {
                console.error('Error loading revenue data', e);
                setLoading(false);
            }
        };

        fetchAll();

        const channels = [
            supabase.channel('rev-invoices').on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, fetchAll).subscribe(),
            supabase.channel('rev-purchase').on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_invoices' }, fetchAll).subscribe(),
            supabase.channel('rev-customers').on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchAll).subscribe(),
            supabase.channel('rev-suppliers').on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, fetchAll).subscribe(),
        ];
        return () => { active = false; channels.forEach(ch => ch.unsubscribe()); };

    }, []);

    // Fill supplier names once both purchase invoices and suppliers are loaded
    useEffect(() => {
        if (!suppliers.length) return;
        const supplierMap = new Map(suppliers.map(s => [s.id, s.companyName]));
        setPurchaseInvoices(prev => prev.map(inv => ({
            ...inv,
            supplierName: inv.supplierName || (inv.supplierId ? (supplierMap.get(inv.supplierId) || '') : inv.supplierName),
        })));
    }, [suppliers]);

    const periodData = useMemo<PeriodDataShape>(() => {
        if (!dateRange?.from || !dateRange?.to) {
            return createEmptyPeriodData();
        }

        const rangeStart = dateRange.from;
        const rangeEnd = dateRange.to;
        const customerNameMap = new Map(customers.map(c => [c.id, c.companyName]));

        const sales = salesInvoices.filter(inv => {
            const invDate = parseISO(inv.invoiceDate);
            return invDate >= rangeStart && invDate <= rangeEnd && inv.status !== 'concept';
        });

        const purchases = purchaseInvoices.filter(inv => {
            const invDate = parseISO(inv.invoiceDate);
            return invDate >= rangeStart && invDate <= rangeEnd;
        });

        const months: MonthInfo[] = [];
        const monthlyMap = new Map<string, MonthlySnapshot>();
        let cursor = startOfMonth(rangeStart);
        const lastMonth = startOfMonth(rangeEnd);
        while (cursor <= lastMonth) {
            const key = format(cursor, 'yyyy-MM');
            const label = format(cursor, 'MMM yyyy', { locale: nl });
            months.push({ key, label });
            monthlyMap.set(key, { key, label, omzet: 0, kosten: 0, resultaat: 0 });
            cursor = addMonths(cursor, 1);
        }

        sales.forEach(inv => {
            const monthKey = format(startOfMonth(parseISO(inv.invoiceDate)), 'yyyy-MM');
            const bucket = monthlyMap.get(monthKey);
            if (bucket) {
                bucket.omzet += inv.subTotal;
            }
        });

        purchases.forEach(inv => {
            const monthKey = format(startOfMonth(parseISO(inv.invoiceDate)), 'yyyy-MM');
            const bucket = monthlyMap.get(monthKey);
            if (bucket) {
                bucket.kosten += inv.subTotal ?? inv.grandTotal;
            }
        });

        const monthlySummary = months.map(month => {
            const data = monthlyMap.get(month.key) ?? { key: month.key, label: month.label, omzet: 0, kosten: 0, resultaat: 0 };
            data.resultaat = data.omzet - data.kosten;
            return data;
        });

        const omzet = monthlySummary.reduce((acc, month) => acc + month.omzet, 0);
        const kosten = monthlySummary.reduce((acc, month) => acc + month.kosten, 0);
        const winst = omzet - kosten;

        const teBetalenBtw = sales.reduce((acc, inv) => acc + inv.vatTotal, 0);
        const teVorderenBtw = purchases.reduce((acc, inv) => acc + (inv.vatTotal || 0), 0);
        const btwBalans = teBetalenBtw - teVorderenBtw;

        const vatBreakdown: VatBreakdown = {
            high: { base: 0, tax: 0 },
            low: { base: 0, tax: 0 },
            zero: { base: 0, tax: 0 },
        };

        sales.forEach(inv => {
            const lines = Array.isArray(inv.lines) ? inv.lines : [];
            lines.forEach(line => {
                const base = line.total;
                const rate = Math.round(line.vatRate || 0);
                const vat = base * (rate / 100);
                if (rate >= 20) {
                    vatBreakdown.high.base += base;
                    vatBreakdown.high.tax += vat;
                } else if (rate >= 8) {
                    vatBreakdown.low.base += base;
                    vatBreakdown.low.tax += vat;
                } else {
                    vatBreakdown.zero.base += base;
                    vatBreakdown.zero.tax += vat;
                }
            });
        });

        const now = new Date();
        const allOpenSales = salesInvoices.filter(inv => inv.status === 'open');
        const debiteurenMap = new Map<string, CounterpartyItem>();
        allOpenSales.forEach(inv => {
            const customerName = inv.customer?.companyName || customerNameMap.get(inv.customerId || '') || 'Onbekende klant';
            const name = customerName;
            const item = debiteurenMap.get(name) || { name, amount: 0, invoiceCount: 0, avgDays: 0 };
            item.amount += inv.grandTotal;
            item.invoiceCount += 1;
            const dueDate = inv.dueDate ? parseISO(inv.dueDate) : parseISO(inv.invoiceDate);
            const daysOpen = differenceInDays(now, dueDate);
            item.avgDays += daysOpen > 0 ? daysOpen : 0;
            debiteurenMap.set(name, item);
        });

        const debiteurenLijst = Array.from(debiteurenMap.values())
            .map(item => ({
                ...item,
                avgDays: item.invoiceCount ? Math.round(item.avgDays / item.invoiceCount) : 0,
            }))
            .sort((a, b) => b.amount - a.amount);

        const teOntvangen = debiteurenLijst.reduce((acc, item) => acc + item.amount, 0);

        const allOpenPurchases = purchaseInvoices.filter(inv => inv.status === 'Verwerkt');
        const crediteurenMap = new Map<string, CounterpartyItem>();
        allOpenPurchases.forEach(inv => {
            const name = inv.supplierName || 'Onbekende leverancier';
            const item = crediteurenMap.get(name) || { name, amount: 0, invoiceCount: 0, avgDays: 0 };
            item.amount += inv.grandTotal;
            item.invoiceCount += 1;
            const due = inv.dueDate ? parseISO(inv.dueDate) : parseISO(inv.invoiceDate);
            item.avgDays += Math.max(0, differenceInDays(now, due));
            crediteurenMap.set(name, item);
        });

        const crediteurenLijst = Array.from(crediteurenMap.values())
            .map(item => ({
                ...item,
                avgDays: item.invoiceCount ? Math.round(item.avgDays / item.invoiceCount) : 0,
            }))
            .sort((a, b) => b.amount - a.amount);

        const teBetalen = crediteurenLijst.reduce((acc, item) => acc + item.amount, 0);

        const startDate = financials ? parseISO(financials.startDate) : new Date(0);
        const startBalance = financials ? financials.startBalance : 0;

        const paidSalesBefore = salesInvoices
            .filter(inv => inv.status === 'paid' && parseISO(inv.invoiceDate) >= startDate && parseISO(inv.invoiceDate) < rangeStart)
            .reduce((sum, inv) => sum + inv.grandTotal, 0);

        const paidPurchasesBefore = purchaseInvoices
            .filter(inv => inv.status === 'Betaald' && parseISO(inv.invoiceDate) >= startDate && parseISO(inv.invoiceDate) < rangeStart)
            .reduce((sum, inv) => sum + inv.grandTotal, 0);

        const beginsaldo = startBalance + paidSalesBefore - paidPurchasesBefore;

        const bijgeschreven = sales.filter(i => i.status === 'paid').reduce((a, c) => a + c.grandTotal, 0);
        const afgeschreven = purchases.filter(i => i.status === 'Betaald').reduce((a, c) => a + c.grandTotal, 0);
        const banksaldo = beginsaldo + bijgeschreven - afgeschreven;
        const werkkapitaal = banksaldo + teOntvangen - teBetalen;

        const revenuePerCustomerMap = new Map<string, RevenuePerCustomer>();
        const customerMetricsMap = new Map<string, CustomerMetric>();
        sales.forEach(inv => {
            const rawCustomerId = (inv as any).customerId;
            const customerId = rawCustomerId ? String(rawCustomerId) : null;
            const monthKey = format(startOfMonth(parseISO(inv.invoiceDate)), 'yyyy-MM');
            const displayName = customerNameMap.get(customerId || '') || inv.customer.companyName || 'Onbekende klant';

            const revEntry = revenuePerCustomerMap.get(displayName) || { name: displayName, perMonth: {}, total: 0 };
            revEntry.perMonth[monthKey] = (revEntry.perMonth[monthKey] || 0) + inv.subTotal;
            revEntry.total += inv.subTotal;
            revenuePerCustomerMap.set(displayName, revEntry);

            const metricKey = customerId || `no-id-${displayName}`;
            if (!customerMetricsMap.has(metricKey)) {
                customerMetricsMap.set(metricKey, {
                    customerId,
                    name: displayName,
                    totalHours: 0,
                    hourRevenue: 0,
                    totalKm: 0,
                    kmRevenue: 0,
                    avgHourRate: 0,
                    avgKmRate: 0,
                });
            }
            const metric = customerMetricsMap.get(metricKey)!;
            const lines = Array.isArray(inv.lines) ? inv.lines : [];
            lines.forEach(line => {
                const quantity = typeof line.quantity === 'number' ? line.quantity : 0;
                const total = typeof line.total === 'number' ? line.total : (quantity || 0) * (line.unitPrice || 0);
                if (isKmDescription(line.description)) {
                    metric.totalKm += quantity;
                    metric.kmRevenue += total;
                }
                if (isHourDescription(line.description)) {
                    metric.totalHours += quantity;
                    metric.hourRevenue += total;
                }
            });
        });

        const revenuePerCustomer = Array.from(revenuePerCustomerMap.values()).sort((a, b) => b.total - a.total);
        const customerMetrics = Array.from(customerMetricsMap.values()).map(metric => ({
            ...metric,
            avgHourRate: metric.totalHours > 0 ? metric.hourRevenue / metric.totalHours : 0,
            avgKmRate: metric.totalKm > 0 ? metric.kmRevenue / metric.totalKm : 0,
        }));
        const bestKmCustomer = customerMetrics
            .filter(m => m.avgKmRate > 0)
            .sort((a, b) => b.avgKmRate - a.avgKmRate)[0] || null;
        const bestHourCustomer = customerMetrics
            .filter(m => m.avgHourRate > 0)
            .sort((a, b) => b.avgHourRate - a.avgHourRate)[0] || null;

        return {
            omzet,
            kosten,
            winst,
            teBetalenBtw,
            teVorderenBtw,
            btwBalans,
            banksaldo,
            teOntvangen,
            teBetalen,
            werkkapitaal,
            beginsaldo,
            bijgeschreven,
            afgeschreven,
            debiteurenLijst,
            crediteurenLijst,
            months,
            monthlySummary,
            vatBreakdown,
            revenuePerCustomer,
            customerMetrics,
            bestKmCustomer,
            bestHourCustomer,
        };
    }, [dateRange, salesInvoices, purchaseInvoices, financials, customers]);

    const renderReport = () => {
        switch (activeReport) {
            case 'result': {
                const rows: { key: 'omzet' | 'kosten' | 'resultaat'; label: string }[] = [
                    { key: 'omzet', label: 'Omzet' },
                    { key: 'kosten', label: 'Kosten' },
                    { key: 'resultaat', label: 'Nettoresultaat' },
                ];
                const totals: Record<typeof rows[number]['key'], number> = {
                    omzet: periodData.omzet,
                    kosten: periodData.kosten,
                    resultaat: periodData.winst,
                };

                return (
                    <Card>
                        <CardHeader>
                            <CardTitle>Resultatenrekening</CardTitle>
                            <CardDescription>Inkomsten en uitgaven per maand binnen het gekozen bereik.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Post</TableHead>
                                        {periodData.months.map(month => (
                                            <TableHead key={month.key} className="text-right">{month.label}</TableHead>
                                        ))}
                                        <TableHead className="text-right">Totaal</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map(row => (
                                        <TableRow key={row.key}>
                                            <TableCell className="font-medium">{row.label}</TableCell>
                                            {periodData.monthlySummary.map(month => (
                                                <TableCell key={`${row.key}-${month.key}`} className="text-right">{formatCurrency(month[row.key])}</TableCell>
                                            ))}
                                            <TableCell className="text-right font-semibold">{formatCurrency(totals[row.key])}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                );
            }
            case 'vat': {
                const vatRows: { key: keyof VatBreakdown; label: string }[] = [
                    { key: 'high', label: 'Leveringen/diensten 21%' },
                    { key: 'low', label: 'Leveringen/diensten 9%' },
                    { key: 'zero', label: '0% of niet bij u belast' },
                ];
                const totalBase = vatRows.reduce((sum, row) => sum + periodData.vatBreakdown[row.key].base, 0);
                const totalTax = vatRows.reduce((sum, row) => sum + periodData.vatBreakdown[row.key].tax, 0);

                return (
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>BTW-overzicht</CardTitle>
                                <CardDescription>Omzet uitgesplitst naar het toegepaste tarief.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Categorie</TableHead>
                                            <TableHead className="text-right">Belastbaar bedrag</TableHead>
                                            <TableHead className="text-right">Omzetbelasting</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {vatRows.map(row => (
                                            <TableRow key={row.key}>
                                                <TableCell className="font-medium">{row.label}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(periodData.vatBreakdown[row.key].base)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(periodData.vatBreakdown[row.key].tax)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="font-semibold">
                                            <TableCell>Totaal</TableCell>
                                            <TableCell className="text-right">{formatCurrency(totalBase)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(totalTax)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                                <div className="grid gap-4 md:grid-cols-3">
                                    <ReportCard title="Te betalen btw" value={formatCurrency(periodData.teBetalenBtw)}>
                                        <ReportRow icon={MinusCircle} color="text-destructive" label="Af te dragen" value={formatCurrency(periodData.teBetalenBtw)} />
                                    </ReportCard>
                                    <ReportCard title="Te vorderen btw" value={formatCurrency(periodData.teVorderenBtw)}>
                                        <ReportRow icon={PlusCircle} color="text-green-500" label="Terug te vragen" value={formatCurrency(periodData.teVorderenBtw)} />
                                    </ReportCard>
                                    <ReportCard title="Saldo" value={formatCurrency(periodData.btwBalans)}>
                                        <ReportRow icon={Circle} color="text-primary" label="Te betalen - te vorderen" value={formatCurrency(periodData.btwBalans)} />
                                    </ReportCard>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );
            }
            case 'debtors': {
                return (
                    <Card>
                        <CardHeader>
                            <CardTitle>Debiteurenoverzicht</CardTitle>
                            <CardDescription>Openstaande verkoopfacturen per klant.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {periodData.debiteurenLijst.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Er zijn momenteel geen openstaande debiteuren.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Klant</TableHead>
                                            <TableHead className="text-right">Openstaand</TableHead>
                                            <TableHead className="text-right">Facturen</TableHead>
                                            <TableHead className="text-right">Gem. dagen open</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {periodData.debiteurenLijst.map(item => (
                                            <TableRow key={item.name}>
                                                <TableCell className="font-medium">{item.name}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                                                <TableCell className="text-right">{item.invoiceCount}</TableCell>
                                                <TableCell className="text-right">{item.avgDays}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                );
            }
            case 'creditors': {
                return (
                    <Card>
                        <CardHeader>
                            <CardTitle>Crediteurenoverzicht</CardTitle>
                            <CardDescription>Inkoopfacturen die nog verwerkt moeten worden.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {periodData.crediteurenLijst.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Er zijn momenteel geen openstaande crediteuren.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Leverancier</TableHead>
                                            <TableHead className="text-right">Openstaand</TableHead>
                                            <TableHead className="text-right">Facturen</TableHead>
                                            <TableHead className="text-right">Gem. dagen open</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {periodData.crediteurenLijst.map(item => (
                                            <TableRow key={item.name}>
                                                <TableCell className="font-medium">{item.name}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                                                <TableCell className="text-right">{item.invoiceCount}</TableCell>
                                                <TableCell className="text-right">{item.avgDays}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                );
            }
            case 'revenue': {
                if (!periodData.months.length) {
                    return <p className="text-sm text-muted-foreground">Geen maanden gevonden binnen de gekozen periode.</p>;
                }

                const totalsPerMonth = periodData.months.reduce<Record<string, number>>((acc, month) => {
                    acc[month.key] = periodData.revenuePerCustomer.reduce((sum, customer) => sum + (customer.perMonth[month.key] || 0), 0);
                    return acc;
                }, {});
                const totalRevenue = periodData.revenuePerCustomer.reduce((sum, customer) => sum + customer.total, 0);

                return (
                    <Card>
                        <CardHeader>
                            <CardTitle>Omzet per klant</CardTitle>
                            <CardDescription>Exclusief btw, verdeeld over de geselecteerde maanden.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {periodData.revenuePerCustomer.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Binnen deze periode is geen omzet geregistreerd.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Klant</TableHead>
                                            {periodData.months.map(month => (
                                                <TableHead key={month.key} className="text-right">{month.label}</TableHead>
                                            ))}
                                            <TableHead className="text-right">Totaal</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {periodData.revenuePerCustomer.map(customer => (
                                            <TableRow key={customer.name}>
                                                <TableCell className="font-medium">{customer.name}</TableCell>
                                                {periodData.months.map(month => (
                                                    <TableCell key={`${customer.name}-${month.key}`} className="text-right">
                                                        {formatCurrency(customer.perMonth[month.key] || 0)}
                                                    </TableCell>
                                                ))}
                                                <TableCell className="text-right font-semibold">{formatCurrency(customer.total)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow className="font-semibold">
                                            <TableCell>Totaal</TableCell>
                                            {periodData.months.map(month => (
                                                <TableCell key={`total-${month.key}`} className="text-right">
                                                    {formatCurrency(totalsPerMonth[month.key] || 0)}
                                                </TableCell>
                                            ))}
                                            <TableCell className="text-right">{formatCurrency(totalRevenue)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                );
            }
            case 'customerTotals': {
                const hasSelection = selectedCustomers.length > 0;
                const filteredMetrics = periodData.customerMetrics.filter(metric => {
                    if (!hasSelection) return true;
                    return metric.customerId ? selectedCustomers.includes(metric.customerId) : false;
                });

                const totals = filteredMetrics.reduce(
                    (acc, metric) => {
                        acc.totalHours += metric.totalHours;
                        acc.totalKm += metric.totalKm;
                        acc.hourRevenue += metric.hourRevenue;
                        acc.kmRevenue += metric.kmRevenue;
                        return acc;
                    },
                    { totalHours: 0, totalKm: 0, hourRevenue: 0, kmRevenue: 0 }
                );
                const selectionBestKm =
                    filteredMetrics
                        .filter(m => m.avgKmRate > 0)
                        .sort((a, b) => b.avgKmRate - a.avgKmRate)[0] || null;
                const selectionBestHour =
                    filteredMetrics
                        .filter(m => m.avgHourRate > 0)
                        .sort((a, b) => b.avgHourRate - a.avgHourRate)[0] || null;

                return (
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <CardTitle>Totaaloverzicht per klant</CardTitle>
                                    <CardDescription>
                                        Vergelijk uren, kilometers en omzet per klant binnen de geselecteerde periode.
                                    </CardDescription>
                                </div>
                                <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                {hasSelection
                                                    ? `${selectedCustomers.length} klant${selectedCustomers.length > 1 ? 'en' : ''} geselecteerd`
                                                    : 'Filter klanten'}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="max-h-72 w-64 overflow-y-auto">
                                            <DropdownMenuLabel>Selecteer klanten</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            {customers.length === 0 && (
                                                <div className="px-2 py-1 text-xs text-muted-foreground">
                                                    Geen klanten gevonden.
                                                </div>
                                            )}
                                            {customers.map(customer => (
                                                <DropdownMenuCheckboxItem
                                                    key={customer.id}
                                                    checked={selectedCustomers.includes(customer.id)}
                                                    onCheckedChange={(checked) => updateCustomerSelection(customer.id, Boolean(checked))}
                                                    className="text-sm"
                                                >
                                                    {customer.companyName}
                                                </DropdownMenuCheckboxItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    {hasSelection && (
                                        <Button variant="ghost" size="sm" onClick={clearCustomerSelection}>
                                            Reset selectie
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="grid gap-2 pt-4 text-sm text-muted-foreground md:grid-cols-2">
                                <p>
                                    Hoogste km-tarief:{' '}
                                    {selectionBestKm || periodData.bestKmCustomer ? (
                                        <span className="font-medium text-foreground">
                                            {(selectionBestKm || periodData.bestKmCustomer)!.name} ({formatCurrency((selectionBestKm || periodData.bestKmCustomer)!.avgKmRate)})
                                        </span>
                                    ) : (
                                        'nog geen data'
                                    )}
                                </p>
                                <p>
                                    Hoogste uurtarief:{' '}
                                    {selectionBestHour || periodData.bestHourCustomer ? (
                                        <span className="font-medium text-foreground">
                                            {(selectionBestHour || periodData.bestHourCustomer)!.name} ({formatCurrency((selectionBestHour || periodData.bestHourCustomer)!.avgHourRate)})
                                        </span>
                                    ) : (
                                        'nog geen data'
                                    )}
                                </p>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {filteredMetrics.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Geen klanten gevonden die voldoen aan de huidige selectie.
                                </p>
                            ) : (
                                <>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Klant</TableHead>
                                                <TableHead className="text-right">Uren</TableHead>
                                                <TableHead className="text-right">Omzet uren</TableHead>
                                                <TableHead className="text-right">Gem. uurtarief</TableHead>
                                                <TableHead className="text-right">Kilometers</TableHead>
                                                <TableHead className="text-right">Omzet km</TableHead>
                                                <TableHead className="text-right">Gem. km-tarief</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredMetrics.map(metric => (
                                                <TableRow key={`${metric.customerId || metric.name}`}>
                                                    <TableCell className="font-medium">{metric.name}</TableCell>
                                                    <TableCell className="text-right">{formatNumberValue(metric.totalHours)}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(metric.hourRevenue)}</TableCell>
                                                    <TableCell className="text-right">
                                                        {metric.avgHourRate > 0 ? formatCurrency(metric.avgHourRate) : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-right">{formatNumberValue(metric.totalKm)}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(metric.kmRevenue)}</TableCell>
                                                    <TableCell className="text-right">
                                                        {metric.avgKmRate > 0 ? formatCurrency(metric.avgKmRate) : '-'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow className="font-semibold">
                                                <TableCell>Totaal selectie</TableCell>
                                                <TableCell className="text-right">{formatNumberValue(totals.totalHours)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(totals.hourRevenue)}</TableCell>
                                                <TableCell className="text-right">
                                                    {totals.totalHours > 0 ? formatCurrency(totals.hourRevenue / totals.totalHours) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right">{formatNumberValue(totals.totalKm)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(totals.kmRevenue)}</TableCell>
                                                <TableCell className="text-right">
                                                    {totals.totalKm > 0 ? formatCurrency(totals.kmRevenue / totals.totalKm) : '-'}
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </>
                            )}
                        </CardContent>
                    </Card>
                );
            }
            case 'overview':
            default:
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-8">
                            <ReportCard title="Resultatenrekening" value={formatCurrency(periodData.winst)}>
                                <ReportRow icon={PlusCircle} color="text-green-500" label="Omzet" value={formatCurrency(periodData.omzet)} />
                                <ReportRow icon={MinusCircle} color="text-red-500" label="Kosten" value={formatCurrency(periodData.kosten)} />
                            </ReportCard>
                            <ReportCard title="Btw-overzicht" value={formatCurrency(periodData.btwBalans)}>
                                <ReportRow icon={MinusCircle} color="text-red-500" label="Te betalen btw" value={formatCurrency(periodData.teBetalenBtw)} />
                                <ReportRow icon={PlusCircle} color="text-green-500" label="Te vorderen btw" value={formatCurrency(periodData.teVorderenBtw)} />
                            </ReportCard>
                            <RankedList 
                                title="Debiteurenoverzicht" 
                                value={formatCurrency(periodData.teOntvangen)} 
                                items={periodData.debiteurenLijst}
                                type="debit"
                            />
                        </div>
                        <div className="space-y-8">
                            <ReportCard title="Balans" value={formatCurrency(periodData.werkkapitaal)}>
                                <p className="text-xs text-muted-foreground -mt-2 mb-2 flex items-center">Werkkapitaal <Info className="h-3 w-3 ml-1" /></p>
                                <ReportRow icon={Circle} color="text-primary" label="Banksaldo" value={formatCurrency(periodData.banksaldo)} />
                                <ReportRow icon={Circle} color="text-green-500" label="Te ontvangen" value={formatCurrency(periodData.teOntvangen)} />
                                <ReportRow icon={Circle} color="text-red-500" label="Te betalen" value={formatCurrency(periodData.teBetalen)} />
                            </ReportCard>
                            <ReportCard title="Kasstroomoverzicht" value={formatCurrency(periodData.banksaldo)}>
                                <ReportRow icon={MinusCircle} color="text-primary" label="Beginsaldo" value={formatCurrency(periodData.beginsaldo)} />
                                <ReportRow icon={PlusCircle} color="text-green-500" label="Bijgeschreven" value={formatCurrency(periodData.bijgeschreven)} />
                                <ReportRow icon={MinusCircle} color="text-red-500" label="Afgeschreven" value={formatCurrency(periodData.afgeschreven)} />
                            </ReportCard>
                            <RankedList 
                                title="Crediteurenoverzicht" 
                                value={formatCurrency(periodData.teBetalen)}
                                items={periodData.crediteurenLijst}
                                type="credit"
                            />
                        </div>
                    </div>
                );
        }
    };

  return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Rapportage</h1>
                    <p className="text-muted-foreground">Overzicht van financi?le gegevens en statistieken.</p>
                </div>
                <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>

            <div className="flex flex-col gap-6 lg:flex-row">
                <aside className="lg:w-64 shrink-0">
                    <nav className="flex flex-wrap gap-2 lg:flex-col">
                        {reportSections.map(section => (
                            <button
                                key={section.id}
                                type="button"
                                onClick={() => setActiveReport(section.id)}
                                className={cn(
                                    "flex-1 rounded-md border px-4 py-2 text-left text-sm font-medium transition hover:bg-muted",
                                    activeReport === section.id
                                        ? "bg-primary text-primary-foreground shadow"
                                        : "bg-background"
                                )}
                                aria-current={activeReport === section.id ? 'page' : undefined}
                            >
                                {section.label}
                            </button>
                        ))}
                    </nav>
                </aside>
                <section className="flex-1">
                    {loading ? (
                        <Skeleton className="h-[400px] w-full rounded-xl" />
                    ) : (
                        renderReport()
                    )}
                </section>
            </div>
        </div>
    );
}
