
"use client";

import { useState, useEffect, useMemo } from 'react';
import type { Invoice, Customer, Supplier } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';
import { mapSupabaseToApp } from '@/lib/utils';
import { DateRange } from "react-day-picker";
import { subQuarters, startOfQuarter, endOfQuarter, format, isPast, parseISO } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingDown, Circle, Info, PlusCircle, MinusCircle } from 'lucide-react';
import Link from 'next/link';
import { DateRangePicker } from '@/components/DateRangePicker';
import { cn } from '@/lib/utils';

const formatCurrency = (value: number | undefined) => {
  if (value === undefined || isNaN(value)) return '-';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
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


export default function RevenuePage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfQuarter(new Date()),
        to: endOfQuarter(new Date()),
    });
    
    const [salesInvoices, setSalesInvoices] = useState<Invoice[]>([]);
    const [purchaseInvoices, setPurchaseInvoices] = useState<any[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [financials, setFinancials] = useState<{startBalance: number, startDate: string} | null>(null);

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);

        let active = true;

        const fetchAll = async () => {
            try {
                const [invRes, piRes, custRes, supRes, finRes] = await Promise.all([
                    supabase.from('invoices').select('*').order('created_at', { ascending: false }),
                    supabase.from('purchase_invoices').select('*').order('created_at', { ascending: false }),
                    supabase.from('customers').select('*'),
                    supabase.from('suppliers').select('*'),
                    supabase.from('financial_settings').select('*').eq('id', 'main').maybeSingle(),
                ]);

                if (!active) return;

                if (!invRes.error) {
                    const mapped = (invRes.data || []).map(r => { const base = mapSupabaseToApp(r) as any; return { ...base, id: r.id } as Invoice; }) as Invoice[];
                    setSalesInvoices(mapped);
                }
                if (!piRes.error) {
                    const mapped = (piRes.data || []).map(r => ({
                        id: r.id,
                        supplierId: r.supplier_id,
                        supplierName: '',
                        invoiceDate: r.invoice_date || new Date().toISOString(),
                        status: r.status,
                        grandTotal: Number(r.total) || 0,
                    }));
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
        if (!suppliers || suppliers.length === 0 || purchaseInvoices.length === 0) return;
        const supplierMap = new Map(suppliers.map(s => [s.id, s.companyName]));
        setPurchaseInvoices(prev => prev.map(inv => ({
            ...inv,
            supplierName: inv.supplierName || (inv.supplierId ? (supplierMap.get(inv.supplierId) || '') : inv.supplierName),
        })));
    }, [suppliers, purchaseInvoices.length]);

    const periodData = useMemo(() => {
        if (!dateRange?.from || !dateRange?.to) {
             const empty = { 
                omzet: 0, kosten: 0, winst: 0, 
                teBetalenBtw: 0, teVorderenBtw: 0, btwBalans: 0, 
                banksaldo: 0, teOntvangen: 0, teBetalen: 0, werkkapitaal: 0,
                beginsaldo: 0, bijgeschreven: 0, afgeschreven: 0,
                debiteurenLijst: [], crediteurenLijst: []
            };
            return empty;
        }

        const sales = salesInvoices.filter(inv => {
            const invDate = parseISO(inv.invoiceDate);
            return invDate >= dateRange.from! && invDate <= dateRange.to! && inv.status !== 'concept';
        });

        const purchases = purchaseInvoices.filter(inv => {
            const invDate = parseISO(inv.invoiceDate);
            return invDate >= dateRange.from! && invDate <= dateRange.to!;
        });

        const omzet = sales.reduce((acc, inv) => acc + inv.subTotal, 0);
        const kosten = purchases.reduce((acc, inv) => acc + (inv.aiResult?.subTotal || 0), 0);
        const winst = omzet - kosten;

        const teBetalenBtw = sales.reduce((acc, inv) => acc + inv.vatTotal, 0);
        const teVorderenBtw = purchases.reduce((acc, inv) => acc + (inv.aiResult?.vatTotal || 0), 0);
        const btwBalans = teBetalenBtw - teVorderenBtw;

        const allOpenSales = salesInvoices.filter(inv => inv.status === 'open' && isPast(parseISO(inv.dueDate)));
        const teOntvangen = allOpenSales.reduce((acc, inv) => acc + inv.grandTotal, 0);

        const debiteuren = allOpenSales.reduce((acc, inv) => {
            const name = inv.customer.companyName;
            acc[name] = (acc[name] || 0) + inv.grandTotal;
            return acc;
        }, {} as Record<string, number>);
        const debiteurenLijst = Object.entries(debiteuren)
            .map(([name, amount]) => ({ name, amount: Number(amount) }))
            .sort((a, b) => b.amount - a.amount);
        
        const allOpenPurchases = purchaseInvoices.filter(inv => inv.status === 'Verwerkt');
        const teBetalen = allOpenPurchases.reduce((acc, inv) => acc + inv.grandTotal, 0);
        
        const crediteuren = allOpenPurchases.reduce((acc, inv) => {
            const name = inv.supplierName;
            acc[name] = (acc[name] || 0) + inv.grandTotal;
            return acc;
        }, {} as Record<string, number>);
        const crediteurenLijst = Object.entries(crediteuren)
            .map(([name, amount]) => ({ name, amount: Number(amount) }))
            .sort((a, b) => b.amount - a.amount);

        // Kasstroom
        const startDate = financials ? parseISO(financials.startDate) : new Date(0);
        const startBalance = financials ? financials.startBalance : 0;
        
        const transactionsBeforePeriod = salesInvoices
            .concat(purchaseInvoices as any)
            .filter(t => parseISO(t.invoiceDate) >= startDate && parseISO(t.invoiceDate) < dateRange.from!);
            
        const beginsaldo = transactionsBeforePeriod.reduce((balance, t) => {
            if ('subTotal' in t && t.status === 'paid') return balance + t.grandTotal; // sales
            if ('aiResult' in t && (t as any).status === 'Betaald') return balance - t.grandTotal; // purchases
            return balance;
        }, startBalance);

        const bijgeschreven = sales.filter(i => i.status === 'paid').reduce((a,c) => a + c.grandTotal, 0);
        const afgeschreven = purchases.filter(i => i.status === 'Betaald').reduce((a,c) => a + c.grandTotal, 0);
        const banksaldo = beginsaldo + bijgeschreven - afgeschreven;
        const werkkapitaal = banksaldo + teOntvangen - teBetalen;
        
        return { 
            omzet, kosten, winst, 
            teBetalenBtw, teVorderenBtw, btwBalans, 
            banksaldo, teOntvangen, teBetalen, werkkapitaal,
            beginsaldo, bijgeschreven, afgeschreven,
            debiteurenLijst, crediteurenLijst
        };

    }, [dateRange, salesInvoices, purchaseInvoices, financials]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Rapportage</h1>
          <p className="text-muted-foreground">Overzicht van financiële gegevens en statistieken.</p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
            <ReportCard title="Resultatenrekening" value={formatCurrency(periodData.winst)} link="/admin/revenue">
                 <ReportRow icon={PlusCircle} color="text-green-500" label="Omzet" value={formatCurrency(periodData.omzet)} />
                 <ReportRow icon={MinusCircle} color="text-red-500" label="Kosten" value={formatCurrency(periodData.kosten)} />
            </ReportCard>
             <ReportCard title="Btw-overzicht" value={formatCurrency(periodData.btwBalans)} link="/admin/revenue">
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
            <ReportCard title="Balans" value={formatCurrency(periodData.werkkapitaal)} link="/admin/revenue">
                 <p className="text-xs text-muted-foreground -mt-2 mb-2 flex items-center">Werkkapitaal <Info className="h-3 w-3 ml-1" /></p>
                 <ReportRow icon={Circle} color="text-primary" label="Banksaldo" value={formatCurrency(periodData.banksaldo)} />
                 <ReportRow icon={Circle} color="text-green-500" label="Te ontvangen" value={formatCurrency(periodData.teOntvangen)} />
                 <ReportRow icon={Circle} color="text-red-500" label="Te betalen" value={formatCurrency(periodData.teBetalen)} />
            </ReportCard>
            <ReportCard title="Kasstroomoverzicht" value={formatCurrency(periodData.banksaldo)} link="/admin/revenue">
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

    </div>
  );
}

    
