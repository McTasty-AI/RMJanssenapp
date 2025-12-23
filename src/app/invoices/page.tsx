

"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Invoice, InvoiceStatus, InvoiceStatusExtended, Customer } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isPast } from 'date-fns';
import { PlusCircle, Trash2, Loader2, CheckCircle, Clock, AlertCircle, Circle, Send, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn, mapSupabaseToApp } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';


type TollStatus = 'added' | 'pending' | 'none';

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
};

const StatusBadge = ({ status }: { status: InvoiceStatusExtended }) => {
    const statusInfo = {
        concept: { variant: "secondary", icon: <Circle className="h-3 w-3" />, text: "Concept" },
        open: { variant: "warning", icon: <Clock className="h-3 w-3" />, text: "Openstaand" },
        paid: { variant: "success", icon: <CheckCircle className="h-3 w-3" />, text: "Betaald" },
        overdue: { variant: "destructive", icon: <AlertCircle className="h-3 w-3" />, text: "Verlopen" },
        all: { variant: "outline", icon: <Circle />, text: "Alles" },
        credit: { variant: "default", icon: <Circle />, text: "Credit" },
    }[status];

    return (
        <Badge variant={statusInfo.variant as any} className="flex items-center gap-1.5 capitalize">
            {statusInfo.icon}
            {statusInfo.text}
        </Badge>
    );
};

const tollStatusInfo: Record<TollStatus, { variant: "secondary" | "success" | "destructive"; label: string }> = {
    added: { variant: "success", label: "Tol toegevoegd" },
    pending: { variant: "destructive", label: "Tol toevoegen" },
    none: { variant: "secondary", label: "Geen tol" },
};

const TollStatusBadge = ({ status }: { status: TollStatus }) => {
    const info = tollStatusInfo[status];
    return (
        <Badge variant={info.variant} className="flex items-center gap-1.5">
            {info.label}
        </Badge>
    );
};

const extractInvoiceContext = (reference?: string | null) => {
    if (!reference) return {};
    const weekMatch = reference.match(/week\s+(\d{1,2})\s*[-/]\s*(\d{4})/i);
    const plateMatch = reference.match(/\(([A-Z0-9-]{5,})\)/i);
    if (!weekMatch || !plateMatch) return {};
    const week = weekMatch[1].padStart(2, '0');
    const year = weekMatch[2];
    const weekId = `${year}-${week}`;
    const licensePlate = plateMatch[1].toUpperCase();
    return { weekId, licensePlate, key: `${weekId}|${licensePlate}` };
};

const formatInvoiceReference = (reference?: string | null): string => {
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
};

type InvoiceWithTollStatus = Invoice & { tollStatus: TollStatus };

const FinancialSummaryBar = ({ summary, counts }: { summary: Record<string, number>, counts: Record<string, number>}) => {
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    if (total === 0) return null;

    const summaryItems = [
        { status: 'concept', color: 'bg-gray-400', label: 'Concept' },
        { status: 'open', color: 'bg-orange-500', label: 'Openstaand' },
        { status: 'overdue', color: 'bg-red-500', label: 'Verlopen' },
        { status: 'paid', color: 'bg-green-500', label: 'Betaald' },
    ];
    
    return (
        <div className="space-y-3 pt-4">
             <div className="flex h-3 rounded-full overflow-hidden">
                {summaryItems.map(item => (
                    <div
                        key={item.status}
                        className={cn("h-full", item.color)}
                        style={{ width: `${(summary[item.status] / total) * 100}%` }}
                        title={`${item.label}: ${formatCurrency(summary[item.status])}`}
                    />
                ))}
            </div>
            <div className="flex flex-wrap justify-around text-xs text-muted-foreground gap-x-4 gap-y-1">
                {summaryItems.map(item => {
                    const amount = summary[item.status] || 0;
                    const count = counts[item.status] || 0;
                    if (count === 0) return null;
                    return (
                        <div key={item.status} className="flex items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                            <span>
                                {formatCurrency(amount)} {item.label} ({count})
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
};


type SortColumn = 'kenmerk' | 'klant' | 'factuurdatum' | 'vervaldatum' | 'bedrag' | null;
type SortDirection = 'asc' | 'desc';

export default function InvoicesPage() {
    const [allInvoices, setAllInvoices] = useState<InvoiceWithTollStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState<InvoiceStatusExtended>('all');
    const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
    const [invoicesToDelete, setInvoicesToDelete] = useState<string[] | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    type ContextInfo = { weekId?: string; licensePlate?: string; key?: string };
    const [showBulkSendDialog, setShowBulkSendDialog] = useState(false);
    const [bulkSendTargets, setBulkSendTargets] = useState<InvoiceWithTollStatus[]>([]);
    const [bulkNeedsTolWarning, setBulkNeedsTolWarning] = useState<InvoiceWithTollStatus[]>([]);
    const [isBulkSending, setIsBulkSending] = useState(false);
    const [sortColumn, setSortColumn] = useState<SortColumn>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const enrichWithTollStatus = useCallback(async (invoices: Invoice[]): Promise<InvoiceWithTollStatus[]> => {
        if (invoices.length === 0) return [];
        const contexts: ContextInfo[] = invoices.map(inv => extractInvoiceContext(inv.reference));
        const invoiceIds = invoices.map(inv => inv.id).filter(Boolean);
        const contextsWithKey = contexts.filter((ctx): ctx is { weekId: string; licensePlate: string; key: string } =>
            Boolean(ctx.weekId && ctx.licensePlate && ctx.key)
        );
        const contextPlateMap = new Map<string, Set<string>>();
        contextsWithKey.forEach(ctx => {
            const week = ctx.weekId;
            const plate = ctx.licensePlate.toUpperCase();
            if (!contextPlateMap.has(week)) contextPlateMap.set(week, new Set());
            contextPlateMap.get(week)!.add(plate);
        });
        const weekIds = Array.from(contextPlateMap.keys());
        const plates = Array.from(new Set(contextsWithKey.map(ctx => ctx.licensePlate.toUpperCase())));
        try {
            const appliedPromise = invoiceIds.length > 0
                ? supabase
                    .from('toll_entries')
                    .select('id, applied_invoice_id')
                    .in('applied_invoice_id', invoiceIds)
                : Promise.resolve<{ data: any[]; error: null }>({ data: [], error: null });
            const groupedPromise = weekIds.length > 0 && plates.length > 0
                ? supabase
                    .from('toll_entries')
                    .select('id, week_id, license_plate, applied_invoice_id')
                    .in('week_id', weekIds)
                    .in('license_plate', plates)
                : Promise.resolve<{ data: any[]; error: null }>({ data: [], error: null });

            const [{ data: appliedRows, error: appliedError }, { data: groupedRows, error: groupedError }] = await Promise.all([appliedPromise, groupedPromise]);
            if (appliedError || groupedError) {
                console.error('Fout bij ophalen tolstatus', appliedError || groupedError);
                return invoices.map(inv => ({ ...inv, tollStatus: 'none' }));
            }

            const appliedCountByInvoice: Record<string, number> = {};
            (appliedRows || []).forEach((row: any) => {
                const id = row.applied_invoice_id;
                if (!id) return;
                appliedCountByInvoice[id] = (appliedCountByInvoice[id] || 0) + 1;
            });

            const pendingByGroup: Record<string, { pending: number; total: number }> = {};
            (groupedRows || []).forEach((row: any) => {
                const weekId = row.week_id;
                const plate = (row.license_plate || '').toUpperCase();
                if (!weekId || !plate) return;
                const key = `${weekId}|${plate}`;
                if (!pendingByGroup[key]) pendingByGroup[key] = { pending: 0, total: 0 };
                pendingByGroup[key].total += 1;
                if (!row.applied_invoice_id) {
                    pendingByGroup[key].pending += 1;
                }
            });

            let weeklyLogRows: any[] = [];
            if (weekIds.length > 0) {
                const { data: weeklyData, error: weeklyErr } = await supabase
                    .from('weekly_logs')
                    .select('id, week_id')
                    .in('week_id', weekIds);
                if (weeklyErr) {
                    console.error('Tolstatus: ophalen weekstaten mislukt', weeklyErr);
                } else {
                    weeklyLogRows = weeklyData || [];
                }
            }
            const logIdToWeek: Record<string, string> = {};
            const weeklyLogIds: string[] = [];
            weeklyLogRows.forEach((row: any) => {
                if (row?.id && row?.week_id) {
                    logIdToWeek[row.id] = row.week_id;
                    weeklyLogIds.push(row.id);
                }
            });
            let dailyRows: any[] = [];
            if (weeklyLogIds.length > 0) {
                const { data: dailyData, error: dailyErr } = await supabase
                    .from('daily_logs')
                    .select('weekly_log_id, toll, license_plate')
                    .in('weekly_log_id', weeklyLogIds);
                if (dailyErr) {
                    console.error('Tolstatus: ophalen dagstaten mislukt', dailyErr);
                } else {
                    dailyRows = dailyData || [];
                }
            }
            const shouldHaveMap: Record<string, boolean> = {};
            dailyRows.forEach((row: any) => {
                const weekId = logIdToWeek[row.weekly_log_id];
                if (!weekId) return;
                const plateRaw = row.license_plate ? String(row.license_plate).toUpperCase() : '';
                if (!plateRaw) return;
                const allowedPlates = contextPlateMap.get(weekId);
                if (!allowedPlates || !allowedPlates.has(plateRaw)) return;
                const tollValue = String(row.toll || '').toLowerCase();
                if (!tollValue || tollValue === 'geen') return;
                const key = `${weekId}|${plateRaw}`;
                shouldHaveMap[key] = true;
            });

            return invoices.map((inv, idx) => {
                const context = contexts[idx];
                const key = context?.key;
                let tollStatus: TollStatus = 'none';
                if (appliedCountByInvoice[inv.id]) {
                    tollStatus = 'added';
                } else if (key) {
                    const group = pendingByGroup[key];
                    if (group && group.pending > 0) {
                        tollStatus = 'pending';
                    } else if (shouldHaveMap[key]) {
                        tollStatus = 'pending';
                    }
                }
                return { ...inv, tollStatus: inv.status === 'concept' ? tollStatus : 'none' };
            });
        } catch (error) {
            console.error('Tolstatus ophalen mislukt', error);
            return invoices.map(inv => ({ ...inv, tollStatus: 'none' }));
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        const fetchInvoices = async () => {
            // Limit to most recent invoices for better performance
            const { data, error } = await supabase
                .from('invoices')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500); // Limit to most recent 500 invoices
            if (!isMounted) return;
            if (error) {
                console.error('Error fetching invoices:', error);
                toast({ variant: 'destructive', title: 'Fout bij ophalen facturen' });
                setLoading(false);
                return;
            }
            const base = (data || []).map(row => mapSupabaseToApp<any>(row));
            const customerIds = Array.from(new Set(base.map(i => i.customerId).filter(Boolean)));
            let customersMap = new Map<string, Customer>();
            if (customerIds.length > 0) {
                // Only select needed fields for better performance
                const { data: custRows, error: custErr } = await supabase
                    .from('customers')
                    .select('id, company_name, street, house_number, postal_code, city')
                    .in('id', customerIds);
                if (!custErr) {
                    (custRows || []).forEach(r => {
                        const c = { ...(mapSupabaseToApp(r) as any), id: r.id } as Customer;
                        customersMap.set(c.id, c);
                    });
                }
            }
            const fullInvoices: Invoice[] = base.map(inv => ({
                ...inv,
                customer: customersMap.get(inv.customerId) || inv.customer || { companyName: '-', street: '', houseNumber: '', postalCode: '', city: '' },
            }));
            const invoicesWithTollStatus = await enrichWithTollStatus(fullInvoices);
            setAllInvoices(invoicesWithTollStatus);
            setLoading(false);
        };

        fetchInvoices();

        const channel = supabase
            .channel('invoices-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
                fetchInvoices();
            })
            .subscribe();

        return () => { isMounted = false; channel.unsubscribe(); };
    }, [toast, enrichWithTollStatus]);
    
    const selectedInvoiceObjects = useMemo(
        () => allInvoices.filter(inv => selectedInvoices.includes(inv.id)),
        [allInvoices, selectedInvoices]
    );
    const hasConceptSelection = selectedInvoiceObjects.some(inv => inv.status === 'concept');
    const { filteredInvoices, financialSummary, financialCounts } = useMemo(() => {
        const summary: Record<string, number> = { 'concept': 0, 'open': 0, 'paid': 0, 'overdue': 0 };
        const counts: Record<string, number> = { 'concept': 0, 'open': 0, 'paid': 0, 'overdue': 0 };
        
        allInvoices.forEach(inv => {
            const isOverdue = inv.status === 'open' && inv.dueDate && isPast(new Date(inv.dueDate));
            if (isOverdue) {
                summary['overdue'] += inv.grandTotal;
                counts['overdue']++;
            } else {
                 if (summary.hasOwnProperty(inv.status)) {
                    summary[inv.status] += inv.grandTotal;
                    counts[inv.status]++;
                }
            }
        });
        
        let filtered = allInvoices;
        if (activeFilter === 'overdue') {
            filtered = allInvoices.filter(invoice => invoice.status === 'open' && isPast(new Date(invoice.dueDate)));
        } else if (activeFilter !== 'all') {
            filtered = allInvoices.filter(invoice => invoice.status === activeFilter);
        }

        // Sort invoices
        if (sortColumn) {
            filtered = [...filtered].sort((a, b) => {
                let aValue: any;
                let bValue: any;
                
                switch (sortColumn) {
                    case 'kenmerk':
                        aValue = formatInvoiceReference(a.reference).toLowerCase();
                        bValue = formatInvoiceReference(b.reference).toLowerCase();
                        break;
                    case 'klant':
                        aValue = a.customer.companyName.toLowerCase();
                        bValue = b.customer.companyName.toLowerCase();
                        break;
                    case 'factuurdatum':
                        aValue = new Date(a.invoiceDate).getTime();
                        bValue = new Date(b.invoiceDate).getTime();
                        break;
                    case 'vervaldatum':
                        aValue = new Date(a.dueDate).getTime();
                        bValue = new Date(b.dueDate).getTime();
                        break;
                    case 'bedrag':
                        aValue = a.grandTotal;
                        bValue = b.grandTotal;
                        break;
                    default:
                        return 0;
                }
                
                if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return { filteredInvoices: filtered, financialSummary: summary, financialCounts: counts };
    }, [allInvoices, activeFilter, sortColumn, sortDirection]);


    const handleSelectAll = (checked: boolean | 'indeterminate') => {
        if (checked === true) {
            setSelectedInvoices(filteredInvoices.map(inv => inv.id));
        } else {
            setSelectedInvoices([]);
        }
    };

    const handleSelectRow = (invoiceId: string, checked: boolean) => {
        if (checked) {
            setSelectedInvoices(prev => [...prev, invoiceId]);
        } else {
            setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
        }
    };

    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            // Toggle direction if clicking the same column
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            // Set new column and default to descending
            setSortColumn(column);
            setSortDirection('desc');
        }
    };
    
    const handleMarkAsPaid = async () => {
        setIsUpdatingStatus(true);
        try {
            const { error } = await supabase
                .from('invoices')
                .update({ status: 'paid' })
                .in('id', selectedInvoices);
            if (error) throw error;
            toast({ title: `${selectedInvoices.length} factu(u)r(en) als betaald gemarkeerd` });
            setSelectedInvoices([]);
        } catch (error) {
            console.error('Error updating status:', error);
            toast({ variant: 'destructive', title: 'Status bijwerken mislukt' });
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    const handleBulkDelete = () => {
        if (selectedInvoices.length === 0) return;
        setInvoicesToDelete(selectedInvoices);
    };
    
     const handleDeleteClick = (invoiceId: string) => {
        setInvoicesToDelete([invoiceId]);
    };

    const handleRowClick = (invoiceId: string) => router.push(`/invoices/${invoiceId}`);
    
    const handleConfirmDelete = async () => {
        if (!invoicesToDelete) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('invoices')
                .delete()
                .in('id', invoicesToDelete);
            if (error) throw error;
            
            // Direct uit de state verwijderen voor snelle UI update
            setAllInvoices(prev => prev.filter(inv => !invoicesToDelete.includes(inv.id)));
            
            toast({ title: `Factu(u)r(en) verwijderd`, description: `${invoicesToDelete.length} factu(u)r(en) succesvol verwijderd.` });
            
            // Ook de geselecteerde facturen wissen
            setSelectedInvoices(prev => prev.filter(id => !invoicesToDelete.includes(id)));
        } catch (error) {
            console.error('Error deleting invoices:', error);
            toast({ variant: 'destructive', title: 'Verwijderen mislukt' });
        } finally {
            setIsDeleting(false);
            setInvoicesToDelete(null);
            setSelectedInvoices([]);
        }
    };

    const handlePrepareBulkSend = () => {
        if (selectedInvoices.length === 0) {
            toast({ variant: 'destructive', title: 'Geen facturen geselecteerd' });
            return;
        }
        const concepts = selectedInvoiceObjects.filter(inv => inv.status === 'concept');
        if (concepts.length === 0) {
            toast({ variant: 'destructive', title: 'Selecteer minstens één conceptfactuur om te verzenden.' });
            return;
        }
        setBulkSendTargets(concepts);
        setBulkNeedsTolWarning(concepts.filter(inv => inv.tollStatus === 'pending'));
        setShowBulkSendDialog(true);
    };

    const handleBulkSendConfirmed = async () => {
        if (bulkSendTargets.length === 0) {
            setShowBulkSendDialog(false);
            return;
        }
        setIsBulkSending(true);
        try {
            const updated: Record<string, string> = {};
            const failures: string[] = [];
            for (const invoice of bulkSendTargets) {
                try {
                    const { data: nextNr, error: nrErr } = await supabase.rpc('next_invoice_number');
                    if (nrErr || !nextNr) throw nrErr || new Error('Geen factuurnummer beschikbaar');
                    const payload = { status: 'open', invoice_number: String(nextNr) };
                    const { error: updateErr } = await supabase.from('invoices').update(payload).eq('id', invoice.id);
                    if (updateErr) throw updateErr;
                    updated[invoice.id] = String(nextNr);
                } catch (error) {
                    console.error('Bulk verzenden fout', error);
                    failures.push(invoice.invoiceNumber || invoice.reference || invoice.id);
                }
            }
            const successIds = Object.keys(updated);
            if (successIds.length > 0) {
                setAllInvoices(prev =>
                    prev.map(inv => {
                        const nr = updated[inv.id];
                        if (!nr) return inv;
                        return { ...inv, status: 'open', invoiceNumber: nr, tollStatus: 'none' };
                    })
                );
                setSelectedInvoices(prev => prev.filter(id => !updated[id]));
                toast({
                    title: 'Facturen verzonden',
                    description: `${successIds.length} factuur/facturen verzonden.`,
                });
            }
            if (failures.length > 0) {
                toast({
                    variant: 'destructive',
                    title: 'Niet alle facturen verzonden',
                    description: `Controleer: ${failures.join(', ')}`,
                });
            }
        } finally {
            setIsBulkSending(false);
            setShowBulkSendDialog(false);
            setBulkSendTargets([]);
            setBulkNeedsTolWarning([]);
        }
    };

    const closeBulkSendDialog = () => {
        if (isBulkSending) return;
        setShowBulkSendDialog(false);
        setBulkSendTargets([]);
        setBulkNeedsTolWarning([]);
    };

    const isAnyToDeleteSent = useMemo(() => {
        if (!invoicesToDelete) return false;
        return invoicesToDelete.some(id => {
            const inv = allInvoices.find(i => i.id === id);
            return inv && inv.status !== 'concept';
        });
    }, [invoicesToDelete, allInvoices]);


     const filterOptions: { label: string; value: InvoiceStatusExtended }[] = [
        { label: 'Alle', value: 'all' },
        { label: 'Concept', value: 'concept' },
        { label: 'Openstaand', value: 'open' },
        { label: 'Verlopen', value: 'overdue' },
        { label: 'Betaald', value: 'paid' },
    ];

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Facturen</h1>
                    <p className="text-muted-foreground">Overzicht van alle verkoopfacturen.</p>
                </div>
                 <Button onClick={() => router.push('/invoices/new')}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Factuur toevoegen
                </Button>
            </div>

            <Card>
                 <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                       <div className="flex gap-2 flex-wrap">
                            {filterOptions.map(opt => (
                                <Button
                                    key={opt.value}
                                    variant={activeFilter === opt.value ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setActiveFilter(opt.value)}
                                >
                                    {opt.label}
                                </Button>
                            ))}
                       </div>
                    </div>
                    {loading ? (
                         <div className="space-y-3 pt-4">
                            <Skeleton className="h-3 w-full" />
                            <div className="flex justify-around">
                                <Skeleton className="h-4 w-1/4" />
                                <Skeleton className="h-4 w-1/4" />
                                <Skeleton className="h-4 w-1/4" />
                            </div>
                        </div>
                    ) : (
                        <FinancialSummaryBar summary={financialSummary} counts={financialCounts} />
                    )}
                </CardHeader>
                <CardContent className="p-0">
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">
                                    <Checkbox
                                        checked={filteredInvoices.length > 0 && selectedInvoices.length === filteredInvoices.length}
                                        onCheckedChange={handleSelectAll}
                                        aria-label="Selecteer alle"
                                     />
                                </TableHead>
                                <TableHead 
                                    className="w-[280px] cursor-pointer hover:bg-muted/50 select-none"
                                    onClick={() => handleSort('kenmerk')}
                                >
                                    <div className="flex items-center gap-2">
                                        Kenmerk
                                        {sortColumn === 'kenmerk' ? (
                                            sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                                        ) : (
                                            <ArrowUpDown className="h-4 w-4 opacity-50" />
                                        )}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="cursor-pointer hover:bg-muted/50 select-none"
                                    onClick={() => handleSort('klant')}
                                >
                                    <div className="flex items-center gap-2">
                                        Klant
                                        {sortColumn === 'klant' ? (
                                            sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                                        ) : (
                                            <ArrowUpDown className="h-4 w-4 opacity-50" />
                                        )}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="w-[140px] cursor-pointer hover:bg-muted/50 select-none"
                                    onClick={() => handleSort('factuurdatum')}
                                >
                                    <div className="flex items-center gap-2">
                                        Factuurdatum
                                        {sortColumn === 'factuurdatum' ? (
                                            sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                                        ) : (
                                            <ArrowUpDown className="h-4 w-4 opacity-50" />
                                        )}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="w-[140px] cursor-pointer hover:bg-muted/50 select-none"
                                    onClick={() => handleSort('vervaldatum')}
                                >
                                    <div className="flex items-center gap-2">
                                        Vervaldatum
                                        {sortColumn === 'vervaldatum' ? (
                                            sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                                        ) : (
                                            <ArrowUpDown className="h-4 w-4 opacity-50" />
                                        )}
                                    </div>
                                </TableHead>
                                <TableHead 
                                    className="w-[150px] text-right cursor-pointer hover:bg-muted/50 select-none"
                                    onClick={() => handleSort('bedrag')}
                                >
                                    <div className="flex items-center justify-end gap-2">
                                        Bedrag
                                        {sortColumn === 'bedrag' ? (
                                            sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                                        ) : (
                                            <ArrowUpDown className="h-4 w-4 opacity-50" />
                                        )}
                                    </div>
                                </TableHead>
                                <TableHead className="w-[240px]">Statussen</TableHead>
                                <TableHead className="w-[100px] text-right">Acties</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="py-1"><Skeleton className="h-5 w-5" /></TableCell>
                                        <TableCell className="py-1"><Skeleton className="h-5 w-full" /></TableCell>
                                        <TableCell className="py-1"><Skeleton className="h-5 w-full" /></TableCell>
                                        <TableCell className="py-1"><Skeleton className="h-5 w-full" /></TableCell>
                                        <TableCell className="py-1"><Skeleton className="h-5 w-full" /></TableCell>
                                        <TableCell className="py-1"><Skeleton className="h-5 w-full" /></TableCell>
                                        <TableCell className="py-1"><Skeleton className="h-6 w-full" /></TableCell>
                                        <TableCell className="py-1"><div className="h-10 w-10 ml-auto flex items-center justify-center"><Skeleton className="h-10 w-10" /></div></TableCell>
                                    </TableRow>
                                ))
                            ) : filteredInvoices.length > 0 ? (
                                filteredInvoices.map(invoice => {
                                    const isOverdue = invoice.status === 'open' && isPast(new Date(invoice.dueDate));
                                    const isCredit = invoice.grandTotal < 0;
                                    return (
                                        <TableRow key={invoice.id} onClick={() => handleRowClick(invoice.id)} className="cursor-pointer">
                                            <TableCell onClick={(e) => e.stopPropagation()} className="py-1">
                                                <Checkbox
                                                    checked={selectedInvoices.includes(invoice.id)}
                                                    onCheckedChange={(checked) => handleSelectRow(invoice.id, !!checked)}
                                                    aria-label={`Selecteer factuur ${invoice.invoiceNumber || 'concept'}`}
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium py-1">
                                                {formatInvoiceReference(invoice.reference)}
                                            </TableCell>
                                            <TableCell className="py-1">{invoice.customer.companyName}</TableCell>
                                            <TableCell className="py-1">{format(new Date(invoice.invoiceDate), 'dd-MM-yyyy')}</TableCell>
                                            <TableCell className="py-1">{format(new Date(invoice.dueDate), 'dd-MM-yyyy')}</TableCell>
                                            <TableCell className={cn("text-right py-1", isCredit && "text-destructive")}>{formatCurrency(invoice.grandTotal)}</TableCell>
                                            <TableCell className="py-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <StatusBadge status={isOverdue ? 'overdue' : invoice.status} />
                                                    {invoice.status === 'concept' && <TollStatusBadge status={invoice.tollStatus} />}
                                                    {isCredit && <Badge variant="secondary">Credit</Badge>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right py-1">
                                                <div className="h-10 flex items-center justify-end">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(invoice.id); }}
                                                        className="text-muted-foreground hover:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            ) : (
                                <TableRow className='h-[52px]'>
                                    <TableCell colSpan={8} className="text-center py-1">
                                       Geen facturen gevonden voor de huidige selectie.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                 {selectedInvoices.length > 0 && (
                    <CardFooter className="p-4 border-t justify-between">
                       <span className="text-sm text-muted-foreground">{selectedInvoices.length} item(s) geselecteerd</span>
                       <div className="flex gap-2 flex-wrap">
                           <Button variant="default" onClick={handlePrepareBulkSend} disabled={!hasConceptSelection || isBulkSending}>
                                {isBulkSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Verzend selectie
                           </Button>
                           <Button variant="outline" onClick={handleMarkAsPaid} disabled={isUpdatingStatus}>
                                {isUpdatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4" />}
                                Markeer als betaald
                           </Button>
                           <Button variant="destructive" onClick={handleBulkDelete}>Verwijder facturen</Button>
                       </div>
                    </CardFooter>
                )}
            </Card>

            <AlertDialog open={!!invoicesToDelete} onOpenChange={(open) => !open && setInvoicesToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {isAnyToDeleteSent
                                ? "Let op: Minstens één van de geselecteerde facturen is al verzonden. Het verwijderen hiervan kan uw administratie verstoren. Deze actie kan niet ongedaan worden gemaakt."
                                : "Deze actie kan niet ongedaan worden gemaakt. Dit zal de geselecteerde factu(u)r(en) permanent verwijderen."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setInvoicesToDelete(null)}>Annuleren</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Verwijderen'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={showBulkSendDialog} onOpenChange={(open) => open ? setShowBulkSendDialog(true) : closeBulkSendDialog()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{bulkNeedsTolWarning.length > 0 ? 'Tol nog niet toegevoegd' : 'Facturen verzenden'}</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                        {bulkNeedsTolWarning.length > 0 ? (
                            <>
                                <p>Het systeem verwacht tol op de volgende facturen:</p>
                                <ul className="list-disc pl-5">
                                    {bulkNeedsTolWarning.map(inv => (
                                        <li key={inv.id}>{formatInvoiceReference(inv.reference)}</li>
                                    ))}
                                </ul>
                                <p>Weet je zeker dat je deze facturen zonder tol wilt versturen?</p>
                            </>
                        ) : (
                            <p>Je staat op het punt {bulkSendTargets.length} conceptfactuur/facturen te versturen.</p>
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={closeBulkSendDialog} disabled={isBulkSending}>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkSendConfirmed} disabled={isBulkSending}>
                        {isBulkSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Verzenden
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
    );
}
