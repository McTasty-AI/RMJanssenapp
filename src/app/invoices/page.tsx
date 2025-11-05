

"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Invoice, InvoiceStatus, InvoiceStatusExtended, Customer } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isPast } from 'date-fns';
import { PlusCircle, Trash2, Loader2, CheckCircle, Clock, AlertCircle, Circle } from 'lucide-react';
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


export default function InvoicesPage() {
    const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState<InvoiceStatusExtended>('all');
    const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
    const [invoicesToDelete, setInvoicesToDelete] = useState<string[] | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        const fetchInvoices = async () => {
            const { data, error } = await supabase
                .from('invoices')
                .select('*')
                .order('created_at', { ascending: false });
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
                const { data: custRows, error: custErr } = await supabase
                    .from('customers')
                    .select('*')
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
            setAllInvoices(fullInvoices);
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
    }, [toast]);
    
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

        return { filteredInvoices: filtered, financialSummary: summary, financialCounts: counts };
    }, [allInvoices, activeFilter]);


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
                                <TableHead className="w-[180px]">Factuurnummer</TableHead>
                                <TableHead>Klant</TableHead>
                                <TableHead className="w-[140px]">Factuurdatum</TableHead>
                                <TableHead className="w-[140px]">Vervaldatum</TableHead>
                                <TableHead className="w-[150px] text-right">Bedrag</TableHead>
                                <TableHead className="w-[200px]">Status</TableHead>
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
                                                {invoice.invoiceNumber || `Concept: ${invoice.reference || `#${invoice.id.substring(0, 5)}`}`}
                                            </TableCell>
                                            <TableCell className="py-1">{invoice.customer.companyName}</TableCell>
                                            <TableCell className="py-1">{format(new Date(invoice.invoiceDate), 'dd-MM-yyyy')}</TableCell>
                                            <TableCell className="py-1">{format(new Date(invoice.dueDate), 'dd-MM-yyyy')}</TableCell>
                                            <TableCell className={cn("text-right py-1", isCredit && "text-destructive")}>{formatCurrency(invoice.grandTotal)}</TableCell>
                                            <TableCell className="py-1">
                                                <div className="flex items-center gap-2">
                                                    <StatusBadge status={isOverdue ? 'overdue' : invoice.status} />
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
                       <div className="flex gap-2">
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
        </div>
    );
}
