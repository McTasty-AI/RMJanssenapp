

"use client";

import { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, Save, Send, CheckCircle, FileText, ArrowUp, ArrowDown, Download, ChevronDown, FileMinus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { mapSupabaseToApp } from '@/lib/utils';
import type { Invoice, InvoiceStatus, CompanyProfile, InvoiceLine } from '@/lib/types';
import { invoiceFormSchema, type InvoiceFormData } from '@/lib/schemas';
import { format, parseISO, addDays } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TextareaAutosize } from '@/components/ui/textarea-autosize';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { invoiceStatusTranslations } from '@/lib/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { generatePdfAction } from '@/app/actions/generatePdfAction';


const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount ?? 0);
}

const StatusBadge = ({ status, isCredit }: { status: InvoiceStatus, isCredit: boolean }) => {
    const variant: Record<InvoiceStatus, "secondary" | "default" | "success"> = {
        concept: 'secondary',
        open: 'default',
        paid: 'success'
    };
    const text = isCredit ? `${invoiceStatusTranslations[status]} (Credit)` : invoiceStatusTranslations[status];
    return <Badge variant={variant[status]} className="capitalize text-lg px-4 py-2">{text}</Badge>;
};


export default function EditInvoicePage() {
    const params = useParams();
    const router = useRouter();
    const invoiceId = params.id as string;
    const { toast } = useToast();
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isCreatingCredit, setIsCreatingCredit] = useState(false);
    const [nextInvoiceNumber, setNextInvoiceNumber] = useState('');
    const [showSentWarning, setShowSentWarning] = useState(false);
    // Tolregels toevoegen gebeurt voortaan alleen via Toloverzichten

    const form = useForm<InvoiceFormData>({
        resolver: zodResolver(invoiceFormSchema),
        defaultValues: {
            lines: [],
            showDailyTotals: false,
            showWeeklyTotals: false,
        },
    });

    const { control, reset, getValues, formState: { isDirty }, watch: watchForm } = form;

    const { fields, append, remove, swap } = useFieldArray({
        control,
        name: 'lines'
    });
    
    useEffect(() => {
        const fetchCompanyProfile = async () => {
            const { data } = await supabase
                .from('company_profile')
                .select('*')
                .eq('id', 'main')
                .maybeSingle();
            if (data) {
                setCompanyProfile({
                    companyName: data.company_name || '',
                    street: data.street || '',
                    houseNumber: data.house_number || '',
                    postalCode: data.postal_code || '',
                    city: data.city || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    kvkNumber: data.kvk_number || '',
                    vatNumber: data.vat_number || '',
                    iban: data.iban || '',
                    logoUrl: data.logo_url || '',
                });
            }
        };
        fetchCompanyProfile();
    }, []);

    useEffect(() => {
        const fetchNextInvoiceNumber = async () => {
            const { data, error } = await supabase.rpc('next_invoice_number');
            if (!error && data) setNextInvoiceNumber(String(data));
        };
        fetchNextInvoiceNumber();
    }, []);

    useEffect(() => {
        if (!invoiceId) {
            router.replace('/invoices');
            return;
        }

        const fetchInvoice = async () => {
            setLoading(true);
            try {
                const { data: invRow, error } = await supabase
                    .from('invoices')
                    .select('*, invoice_lines(*)')
                    .eq('id', invoiceId)
                    .single();
                if (error || !invRow) throw error;

                // Build customer snapshot
                let customer = invRow.customer_snapshot ? mapSupabaseToApp(invRow.customer_snapshot) : null;
                if (!customer && invRow.customer_id) {
                    const { data: cust } = await supabase
                        .from('customers')
                        .select('*')
                        .eq('id', invRow.customer_id)
                        .maybeSingle();
                    if (cust) customer = { ...(mapSupabaseToApp(cust) as any), id: cust.id } as any;
                }
                if (!customer) {
                    customer = { companyName: '-', street: '', houseNumber: '', postalCode: '', city: '' } as any;
                }

                // Map raw rows and then sort by Day (Ma..Zo) and within day by kind: kilometers -> uren -> tol
                const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
                const rawLines: InvoiceLine[] = (invRow.invoice_lines || []).map((l: any) => {
                    const desc = String(l.description || '');
                    const qty = Number(l.quantity) || 0;
                    let unit = Number(l.unit_price) || 0;
                    const isHours = desc.toLowerCase().includes('uren');
                    if (isHours) unit = round2(unit);
                    const totals = Number(l.total) || (qty * unit);
                    return {
                        description: l.description,
                        quantity: qty,
                        unitPrice: unit,
                        // Preserve 0% correctly; only default if value is null/undefined/non-numeric
                        vatRate: Number.isFinite(Number(l.vat_rate)) ? Number(l.vat_rate) : 21,
                        total: isHours ? round2(totals) : totals,
                    } as InvoiceLine;
                });

                const dayIndex = (desc: string): number => {
                    const s = (desc || '').toLowerCase();
                    if (s.startsWith('maandag')) return 1;
                    if (s.startsWith('dinsdag')) return 2;
                    if (s.startsWith('woensdag')) return 3;
                    if (s.startsWith('donderdag')) return 4;
                    if (s.startsWith('vrijdag')) return 5;
                    if (s.startsWith('zaterdag')) return 6;
                    if (s.startsWith('zondag')) return 7;
                    return 100; // non-day lines go last
                };

                const kindIndex = (desc: string): number => {
                    const s = (desc || '').toLowerCase();
                    if (s.includes('kilometer') || s.includes('kilometers') || s.includes(' km') || s.includes('km ') || s.includes('diesel') || s.includes('dot')) return 1; // kilometers/rates
                    if (s.includes('uren')) return 2; // hours
                    if (s.includes('tol')) return 3; // toll
                    return 99;
                };

                const lines: InvoiceLine[] = rawLines
                    .map((l, idx) => ({ l, idx }))
                    .sort((a, b) => {
                        const da = dayIndex(a.l.description);
                        const db = dayIndex(b.l.description);
                        if (da !== db) return da - db;
                        const ka = kindIndex(a.l.description);
                        const kb = kindIndex(b.l.description);
                        if (ka !== kb) return ka - kb;
                        return a.idx - b.idx; // stable
                    })
                    .map(x => x.l);

                const inv: Invoice = {
                    id: invRow.id,
                    invoiceNumber: invRow.invoice_number || '',
                    status: invRow.status,
                    customer: customer as any,
                    invoiceDate: invRow.invoice_date,
                    dueDate: invRow.due_date,
                    reference: invRow.reference || '',
                    lines,
                    subTotal: Number(invRow.sub_total) || 0,
                    vatTotal: Number(invRow.vat_total) || 0,
                    grandTotal: Number(invRow.grand_total) || 0,
                    createdAt: invRow.created_at,
                    footerText: invRow.footer_text || '',
                    showDailyTotals: invRow.show_daily_totals || false,
                    showWeeklyTotals: invRow.show_weekly_totals || false,
                    showWorkTimes: invRow.show_work_times || false,
                };

                setInvoice(inv);
                reset({
                    ...inv,
                    customerId: (invRow as any).customer_id || '',
                    invoiceDate: parseISO(inv.invoiceDate),
                    dueDate: parseISO(inv.dueDate),
                } as any);

                if (inv.status === 'open' || inv.status === 'paid') setShowSentWarning(true);
            } catch (err) {
                router.replace('/invoices');
            } finally {
                setLoading(false);
            }
        };

        fetchInvoice();
    }, [invoiceId, reset, router]);


    const watchedLines = useWatch({ control, name: 'lines' });
    const { subTotal, vatTotal, grandTotal, hasEmptyToll, vatBreakdown } = useMemo(() => {
        let hasEmptyToll = false;
        const vatGroups: Record<number, { subTotal: number; vatAmount: number }> = {};
        const totals = (watchedLines || []).reduce((acc, line) => {
            const quantity = Number(line.quantity) || 0;
            const unitPrice = Number(line.unitPrice) || 0;
            const vatRate = line.vatRate || 0;
            
            // Unit prices are exclusive of VAT, so calculate subtotal and VAT separately
            const lineSubTotal = quantity * unitPrice; // Exclusief BTW
            const lineVatAmount = lineSubTotal * (vatRate / 100); // BTW bedrag
            const lineTotal = lineSubTotal + lineVatAmount; // Inclusief BTW

            acc.subTotal += lineSubTotal;
            acc.vatTotal += lineVatAmount;
            acc.grandTotal = acc.subTotal + acc.vatTotal;

            // Group by VAT rate
            if (!vatGroups[vatRate]) {
                vatGroups[vatRate] = { subTotal: 0, vatAmount: 0 };
            }
            vatGroups[vatRate].subTotal += lineSubTotal;
            vatGroups[vatRate].vatAmount += lineVatAmount;

            if (line.description.toLowerCase().includes('tol') && (!line.quantity || !line.unitPrice)) {
                hasEmptyToll = true;
            }

            return acc;
        }, { subTotal: 0, vatTotal: 0, grandTotal: 0 });
        
        return { ...totals, hasEmptyToll, vatBreakdown: vatGroups };

    }, [watchedLines]);

    const watchedShowDailyTotals = useWatch({ control, name: 'showDailyTotals' });
    const watchedShowWeeklyTotals = useWatch({ control, name: 'showWeeklyTotals' });


    const tableBodyWithTotals = useMemo(() => {
        const body: (InvoiceLine & { id: string } | { type: 'day_total' | 'week_total', content: string, value?: number, key: string })[] = [];
        // Non-toll day aggregation
        let currentDay = '';
        let daySubtotal = 0;
        let weekTotalHours = 0;
        let weekTotalKms = 0;
        // Ensure unique React keys for day totals even if a day appears multiple times
        let dayTotalSeq = 0;
        // Collect toll lines separately to render as a section at the end
        const tollLines: (InvoiceLine & { id: string })[] = [];
        let tollTotal = 0;

        const processDaySubtotal = () => {
            if (watchedShowDailyTotals && currentDay && daySubtotal > 0) {
                body.push({ type: 'day_total', content: `Totaal ${currentDay}`, value: daySubtotal, key: `daytotal-${currentDay}-${dayTotalSeq}` });
                dayTotalSeq += 1;
            }
            daySubtotal = 0;
        };

        (fields || []).forEach((line, index) => {
            const lineDescription = line.description?.toLowerCase() || '';
            const dayMatch = lineDescription.match(/^(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)/i);
            const dayName = dayMatch ? dayMatch[0].charAt(0).toUpperCase() + dayMatch[0].slice(1) : '';
            
            if (dayName && dayName !== currentDay) {
                processDaySubtotal();
                currentDay = dayName;
            }
            
            const isMileageRate = ['kilometers', 'km', ' dot', 'diesel'].some(keyword => lineDescription.includes(keyword));
            const isHourRate = lineDescription.includes('uren');
            const isTollLine = lineDescription.includes('tol');
            const quantity = Number(line.quantity) || 0;
            const unitPrice = Number(line.unitPrice) || 0;
            const vatRate = line.vatRate || 0;
            const lineSubTotal = quantity * unitPrice; // Exclusief BTW
            const lineVatAmount = lineSubTotal * (vatRate / 100); // BTW bedrag
            const lineTotal = lineSubTotal + lineVatAmount; // Inclusief BTW voor weergave
            
            if (isHourRate) weekTotalHours += line.quantity || 0;
            if (isMileageRate) weekTotalKms += line.quantity || 0;

            // Collect toll lines for a separate section at the bottom; other lines go directly in the body
            if (isTollLine) {
                tollLines.push(line as any);
                tollTotal += lineTotal;
            } else {
                body.push(line);
                if (isHourRate || isMileageRate) {
                    daySubtotal += lineTotal; // Day subtotal uses total including VAT
                }
            }
        });

        processDaySubtotal(); // Process the last day

        // Append toll section at the bottom, ordered as the current fields order (already sorted earlier)
        if (tollLines.length > 0) {
            body.push({ type: 'week_total', content: 'Tol', key: 'toll-header' });
            tollLines.forEach(l => body.push(l));
            body.push({ type: 'day_total', content: 'Totaal tol', value: tollTotal, key: 'toll-total' });
        }

        if (watchedShowWeeklyTotals) {
             body.push({ type: 'week_total', content: `Totaal uren: ${weekTotalHours.toFixed(2)} | Totaal kilometers: ${weekTotalKms.toFixed(2)}`, key: 'weektotal-summary'});
        }
        
        return body;
    }, [fields, watchedShowDailyTotals, watchedShowWeeklyTotals]);


    const isReadOnly = invoice?.status === 'paid';

    // Infer dates present in invoice for toll lookup
    const invoiceDateRange = useMemo(() => {
        const rx = /(\d{2})-(\d{2})-(\d{4})/;
        let min: Date | null = null;
        let max: Date | null = null;
        (fields || []).forEach(line => {
            const m = line.description?.match(rx);
            if (m) {
                const [_, dd, mm, yyyy] = m;
                const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
                if (!min || d < min) min = d;
                if (!max || d > max) max = d;
            }
        });
        return { min, max };
    }, [fields]);

    // Opslaan: update factuur en vervang regels
    const handleUpdate = async (data: InvoiceFormData) => {
        setIsSubmitting(true);
        try {
            const { error: upErr } = await supabase
                .from('invoices')
                .update({
                    invoice_number: data.invoiceNumber || '',
                    invoice_date: data.invoiceDate.toISOString(),
                    due_date: data.dueDate.toISOString(),
                    reference: data.reference,
                    sub_total: subTotal,
                    vat_total: vatTotal,
                    grand_total: grandTotal,
                    footer_text: data.footerText,
                    show_daily_totals: data.showDailyTotals,
                    show_weekly_totals: data.showWeeklyTotals,
                })
                .eq('id', invoiceId);
            if (upErr) throw upErr;

            // Replace invoice lines
            await supabase.from('invoice_lines').delete().eq('invoice_id', invoiceId);
            const rows = data.lines.map(l => ({
                invoice_id: invoiceId,
                quantity: l.quantity || 0,
                description: l.description,
                unit_price: Number(l.unitPrice) || 0,
                vat_rate: (Number.isFinite(Number(l.vatRate)) ? Number(l.vatRate) : 21),
                total: (l.quantity || 0) * (Number(l.unitPrice) || 0),
            }));
            if (rows.length > 0) {
                const { error: lineErr } = await supabase.from('invoice_lines').insert(rows);
                if (lineErr) throw lineErr;
            }

            // If there are no toll lines anymore on this invoice, unapply any linked toll entries
            const hasTollLines = (data.lines || []).some(l => (l.description || '').toLowerCase().includes('tol') && ((Number(l.unitPrice) || 0) > 0 || (Number(l.quantity) || 0) > 0));
            if (!hasTollLines) {
                try {
                    await supabase
                        .from('toll_entries')
                        .update({ applied_invoice_id: null, applied_at: null })
                        .eq('applied_invoice_id', invoiceId);
                } catch (_) { /* ignore */ }
            }

            toast({ title: 'Factuur bijgewerkt' });
            reset(data, { keepDirty: false });
        } catch (error) {
            console.error('Update invoice error:', error);
            toast({ variant: 'destructive', title: 'Update mislukt' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleStatusChange = async (newStatus: InvoiceStatus) => {
         if (!invoice) return;
        
        if (newStatus === 'open' && hasEmptyToll) {
            toast({
                variant: 'destructive',
                title: 'Verzenden mislukt',
                description: 'Vul a.u.b. de hoeveelheid en het tarief in voor alle tol-regels.'
            });
            return;
        }

        setIsSubmitting(true);
        try {
            let payload: any = { status: newStatus };
            if (invoice.status === 'concept' && newStatus === 'open') {
                // ensure invoice number
                const { data: nextNr, error: nrErr } = await supabase.rpc('next_invoice_number');
                if (!nrErr && nextNr) {
                    payload.invoice_number = String(nextNr);
                    form.setValue('invoiceNumber', String(nextNr));
                    toast({ title: 'Factuur verzonden!', description: `Factuurnummer ${nextNr} is toegekend.` });
                }
            } else if (newStatus === 'paid') {
                toast({ title: 'Factuur gemarkeerd als betaald' });
            }
            const { error } = await supabase.from('invoices').update(payload).eq('id', invoiceId);
            if (error) throw error;
            setInvoice(prev => prev ? { ...prev, ...mapSupabaseToApp(payload) } : null);
        } catch (error) {
            console.error('Status change error:', error);
            toast({ variant: 'destructive', title: 'Statuswijziging mislukt' });
        } finally {
            setIsSubmitting(false);
        }
    }

    const imageToDataUri = async (url: string): Promise<string | null> => {
        try {
            const response = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch image via proxy: ${response.statusText}`);
            }
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result as string);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error("Error converting image to data URI:", error);
            toast({
                variant: 'destructive',
                title: 'Logo kon niet worden geladen',
                description: 'De afbeelding voor het logo kon niet worden verwerkt voor de PDF.',
            });
            return null;
        }
    };
    

    const handleDownloadPdf = async () => {
        if (!companyProfile) {
            toast({ variant: 'destructive', title: 'Bedrijfsprofiel niet geladen' });
            return;
        }
        setIsDownloading(true);

        try {
            const logoDataUri = companyProfile.logoUrl ? await imageToDataUri(companyProfile.logoUrl) : null;
            
            const currentInvoiceData = getValues();
            const blob = await generatePdfAction({
                ...currentInvoiceData,
                invoiceNumber: currentInvoiceData.invoiceNumber || 'Concept',
                lines: currentInvoiceData.lines.map(l => ({...l, unitPrice: Number(l.unitPrice) || 0, total: (l.quantity || 0) * (Number(l.unitPrice) || 0) })),
                invoiceDate: currentInvoiceData.invoiceDate.toISOString(),
                dueDate: currentInvoiceData.dueDate.toISOString(),
                subTotal,
                vatTotal,
                grandTotal,
                showDailyTotals: currentInvoiceData.showDailyTotals,
                showWeeklyTotals: currentInvoiceData.showWeeklyTotals,
            }, companyProfile, logoDataUri);
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            if (invoice?.status === 'concept') {
                a.download = `${invoice.reference} CONCEPT.pdf`;
            } else {
                a.download = `${invoice?.invoiceNumber}.pdf`;
            }

            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'PDF Download Mislukt' });
        } finally {
            setIsDownloading(false);
        }
    };

    const handleCreateCreditInvoice = async () => {
        if (!invoice) return;

        setIsCreatingCredit(true);

        const creditInvoiceLines = invoice.lines.map(line => ({
            ...line,
            quantity: -Math.abs(line.quantity) // Ensure quantity is negative
        }));

        const newSubTotal = -Math.abs(invoice.subTotal);
        const newVatTotal = -Math.abs(invoice.vatTotal);
        const newGrandTotal = -Math.abs(invoice.grandTotal);

        const creditInvoiceData: Omit<Invoice, 'id'> = {
            ...invoice,
            status: 'concept',
            invoiceNumber: '', // Will be assigned on sending
            reference: `Credit voor factuur ${invoice.invoiceNumber}`,
            invoiceDate: new Date().toISOString(),
            dueDate: addDays(new Date(), 30).toISOString(), // Default 30 days for credit
            lines: creditInvoiceLines,
            subTotal: newSubTotal,
            vatTotal: newVatTotal,
            grandTotal: newGrandTotal,
            createdAt: new Date().toISOString()
        };

        try {
            const { data: newInv, error: invErr } = await supabase
              .from('invoices')
              .insert({
                  invoice_number: '',
                  status: 'concept',
                  customer_id: (invoice as any).customerId || null,
                  invoice_date: new Date().toISOString(),
                  due_date: addDays(new Date(), 30).toISOString(),
                  reference: `Credit voor factuur ${invoice.invoiceNumber}`,
                  sub_total: newSubTotal,
                  vat_total: newVatTotal,
                  grand_total: newGrandTotal,
                  footer_text: invoice.footerText,
                  show_daily_totals: invoice.showDailyTotals,
                  show_weekly_totals: invoice.showWeeklyTotals,
              })
              .select('*')
              .single();
            if (invErr || !newInv) throw invErr;
            const lines = creditInvoiceLines.map(l => ({
                invoice_id: newInv.id,
                quantity: l.quantity || 0,
                description: l.description,
                unit_price: Number(l.unitPrice) || 0,
                vat_rate: (Number.isFinite(Number(l.vatRate)) ? Number(l.vatRate) : 21),
                total: (l.quantity || 0) * (Number(l.unitPrice) || 0),
            }));
            if (lines.length > 0) await supabase.from('invoice_lines').insert(lines);
            toast({ title: 'Creditfactuur aangemaakt', description: 'De concept-creditfactuur is aangemaakt. U wordt nu doorgestuurd.' });
            router.push(`/invoices/${newInv.id}`);
        } catch (error) {
            console.error('Error creating credit invoice:', error);
            toast({ variant: 'destructive', title: 'Aanmaken Mislukt' });
            setIsCreatingCredit(false);
        }
    };
    
    if (loading) {
        return (
             <div className="flex justify-center items-center h-screen">
                <div className="text-center">
                    <Loader2 className="animate-spin mx-auto mt-4 h-8 w-8 text-primary"/>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-muted/30 min-h-screen">
        <AlertDialog open={showSentWarning} onOpenChange={setShowSentWarning}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Waarschuwing</AlertDialogTitle>
                <AlertDialogDescription>
                    Deze factuur is al verzonden, het is niet aan te raden wijzigingen te maken zonder de ontvanger in te lichten. Weet je zeker dat je deze factuur wilt bewerken?
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => router.push('/invoices')}>Annuleren</AlertDialogCancel>
                <AlertDialogAction onClick={() => setShowSentWarning(false)}>Doorgaan met bewerken</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <div className="space-y-8">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(handleUpdate)}>
                 <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Factuur Bewerken</h1>
                        <p className="text-muted-foreground">Pas de factuur aan en beheer de status.</p>
                    </div>
                     <div className='flex items-center gap-2'>
                        {invoice && <StatusBadge status={invoice.status} isCredit={invoice.grandTotal < 0} />}
                        <Button type="button" variant="outline" onClick={() => router.push('/invoices')}>
                            Terug naar overzicht
                        </Button>
                     </div>
                 </div>
                 
                <Card className="shadow-lg">
                    <CardHeader>
                        <div className="flex justify-end items-center gap-2">
                            {!isReadOnly && (
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-4 w-4" />}
                                    Wijzigingen Opslaan
                                </Button>
                            )}

                            {/* Tol toevoegen via factuur is verwijderd; dit blok blijft leeg */}

                             <Button type="button" variant="secondary" onClick={handleDownloadPdf} disabled={isDownloading}>
                                {isDownloading ? <Loader2 className="animate-spin mr-2"/> : <Download className="mr-2 h-4 w-4" />}
                                Download PDF
                            </Button>

                            {invoice?.status === 'open' && (
                                <Button variant="success" onClick={() => handleStatusChange('paid')} disabled={isSubmitting}>
                                    <CheckCircle className="mr-2 h-4 w-4" /> Markeer als Betaald
                                </Button>
                            )}
                             {(invoice?.status === 'open' || invoice?.status === 'paid') && (
                                <Button type="button" variant="destructive" onClick={handleCreateCreditInvoice} disabled={isCreatingCredit}>
                                    {isCreatingCredit ? <Loader2 className="animate-spin mr-2"/> : <FileMinus className="mr-2 h-4 w-4" />}
                                    Creditfactuur aanmaken
                                </Button>
                            )}
                            {invoice?.status === 'concept' && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="default" disabled={isSubmitting || hasEmptyToll}>
                                            <Send className="mr-2 h-4 w-4" /> Verzenden
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>Factuur verzenden?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Deze actie is definitief. De factuur krijgt het nummer <strong>{nextInvoiceNumber}</strong> en de status wordt &quot;Openstaand&quot;.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleStatusChange('open')}>Verzenden</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="p-10 pt-10">
                            <div className="flex justify-between items-start mb-8">
                            <div className="w-[45%] flex flex-col">
                                <div className="relative h-24">
                                      {companyProfile?.logoUrl && (
                                        <Image
                                            src={`/api/image-proxy?url=${encodeURIComponent(companyProfile.logoUrl)}`}
                                            alt="Bedrijfslogo"
                                            fill
                                            sizes="(max-width: 768px) 100vw, 45vw"
                                            style={{ objectFit: 'contain', objectPosition: 'left' }}
                                        />
                                      )}
                                </div>
                                <div className="space-y-1 text-sm mt-8">
                                     <p className="font-semibold text-foreground mb-2">Factuur aan:</p>
                                     <FormField control={form.control} name="customer.companyName" render={({field}) => (
                                        <FormItem><FormControl><Input placeholder="Bedrijfsnaam" {...field} disabled={isReadOnly} className="text-md font-bold border-0 px-1 h-auto" /></FormControl></FormItem>
                                    )}/>
                                    {form.getValues('customer.contactName') && (
                                         <FormField control={form.control} name="customer.contactName" render={({field}) => (
                                            <FormItem><FormControl><Input placeholder="T.a.v." {...field} value={`T.a.v. ${field.value || ''}`} disabled={isReadOnly} className="text-sm text-muted-foreground border-0 px-1 h-auto" /></FormControl></FormItem>
                                        )}/>
                                    )}
                                    <div className="flex gap-2">
                                        <FormField control={form.control} name="customer.street" render={({field}) => (
                                            <FormItem className="flex-grow"><FormControl><Input placeholder="Straat" disabled={isReadOnly} {...field} className="text-sm text-muted-foreground border-0 px-1 h-auto" /></FormControl></FormItem>
                                        )}/>
                                        <FormField control={form.control} name="customer.houseNumber" render={({field}) => (
                                            <FormItem><FormControl><Input placeholder="Nr" {...field} disabled={isReadOnly} className="text-sm text-muted-foreground border-0 px-1 h-auto w-16" /></FormControl></FormItem>
                                        )}/>
                                    </div>
                                    <div className="flex gap-2">
                                        <FormField control={form.control} name="customer.postalCode" render={({field}) => (
                                            <FormItem><FormControl><Input placeholder="Postcode" {...field} disabled={isReadOnly} className="text-sm text-muted-foreground border-0 px-1 h-auto w-24" /></FormControl></FormItem>
                                        )}/>
                                        <FormField control={form.control} name="customer.city" render={({field}) => (
                                            <FormItem className="flex-grow"><FormControl><Input placeholder="Stad" {...field} disabled={isReadOnly} className="text-sm text-muted-foreground border-0 px-1 h-auto" /></FormControl></FormItem>
                                        )}/>
                                    </div>
                                </div>
                            </div>
                                <div className="text-right space-y-2">
                                <p className="font-bold text-lg text-foreground">{companyProfile?.companyName}</p>
                                <div className="space-y-1 text-sm text-muted-foreground">
                                    <p>{companyProfile?.street} {companyProfile?.houseNumber}</p>
                                    <p>{companyProfile?.postalCode} {companyProfile?.city}</p>
                                    <br/>
                                    <p>{companyProfile?.email}</p>
                                    <p>{companyProfile?.phone}</p>
                                    <br/>
                                    <p>KVK: {companyProfile?.kvkNumber}</p>
                                    <p>Btw: {companyProfile?.vatNumber}</p>
                                    <p>Bank: {companyProfile?.iban}</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-8 mb-8 mt-16">
                            <div>
                                <h2 className="text-2xl font-bold text-foreground">Factuur {invoice?.invoiceNumber || 'Concept'}</h2>
                                <div className="flex gap-4 mt-2">
                                    <span className="text-sm text-muted-foreground">Kenmerk:</span>
                                     <FormField control={form.control} name="reference" render={({field}) => (
                                        <FormItem className="flex-grow"><FormControl><Input variant="simple" {...field} value={field.value ?? ''} placeholder="Optioneel kenmerk" disabled={isReadOnly} className="text-sm border-0 px-1 h-auto" /></FormControl></FormItem>
                                    )}/>
                                </div>
                            </div>
                            <div className="text-right text-sm space-y-2">
                                <div className="flex justify-end gap-4">
                                    <span className="text-muted-foreground">Factuurdatum:</span>
                                    <span>{format(form.getValues('invoiceDate'), 'dd-MM-yyyy')}</span>
                                </div>
                                <div className="flex justify-end gap-4">
                                    <span className="text-muted-foreground">Vervaldatum:</span>
                                    <span>{format(form.getValues('dueDate'), 'dd-MM-yyyy')}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flow-root">
                            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[50px]"></TableHead>
                                                <TableHead className="w-[100px]">Aantal</TableHead>
                                                <TableHead className="w-2/5">Omschrijving</TableHead>
                                                <TableHead className="w-[120px]">Tarief</TableHead>
                                                <TableHead className="w-[120px] text-right">BTW %</TableHead>
                                                <TableHead className="w-[150px] text-right">Totaal</TableHead>
                                                <TableHead className="w-[50px]"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {tableBodyWithTotals.map((lineOrTotal, index) => {
                                                if ('type' in lineOrTotal) {
                                                    if (lineOrTotal.type === 'day_total') {
                                                        return (
                                                            <TableRow key={lineOrTotal.key} className="bg-muted/50 font-bold">
                                                                <TableCell colSpan={5} className="text-right">{lineOrTotal.content}</TableCell>
                                                                <TableCell className="text-right pr-4">{formatCurrency(lineOrTotal.value || 0)}</TableCell>
                                                                <TableCell></TableCell>
                                                            </TableRow>
                                                        );
                                                    }
                                                    if (lineOrTotal.type === 'week_total') {
                                                        return (
                                                            <TableRow key={lineOrTotal.key} className="bg-muted font-bold">
                                                                <TableCell colSpan={7} className="text-left">{lineOrTotal.content}</TableCell>
                                                            </TableRow>
                                                        );
                                                    }
                                                }
                                                
                                                const line = lineOrTotal as InvoiceLine & { id: string };
                                                const originalIndex = fields.findIndex(f => f.id === line.id);
                                                
                                                const lineValues = form.watch(`lines.${originalIndex}`);
                                                const quantity = Number(lineValues?.quantity) || 0;
                                                const unitPrice = Number(lineValues?.unitPrice) || 0;
                                                const vatRate = lineValues?.vatRate || 0;
                                                const lineSubTotal = quantity * unitPrice; // Exclusief BTW
                                                const lineVatAmount = lineSubTotal * (vatRate / 100); // BTW bedrag
                                                const lineTotal = lineSubTotal + lineVatAmount; // Inclusief BTW

                                                const description = line?.description?.toLowerCase() || '';
                                                const isTollLine = description.includes('tol');
                                                const tollValueIsEmpty = isTollLine && (!line.quantity || !line.unitPrice);
                                                return (
                                                    <TableRow key={line.id}>
                                                        <TableCell className="align-top py-2">
                                                            <div className="flex flex-col gap-1 justify-center h-full">
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={() => swap(originalIndex, originalIndex - 1)}
                                                                    disabled={originalIndex === 0 || isReadOnly}
                                                                >
                                                                    <ArrowUp className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={() => swap(originalIndex, originalIndex + 1)}
                                                                    disabled={originalIndex === fields.length - 1 || isReadOnly}
                                                                >
                                                                    <ArrowDown className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="align-top py-2">
                                                            <FormField
                                                                control={form.control}
                                                                name={`lines.${originalIndex}.quantity`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            {...field}
                                                                            onChange={e => field.onChange(Number(e.target.value))}
                                                                            placeholder="1"
                                                                            className={cn(tollValueIsEmpty && 'border-red-500')}
                                                                            disabled={isReadOnly}
                                                                        />
                                                                    </FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="align-top py-2">
                                                            <Controller
                                                                name={`lines.${originalIndex}.description`}
                                                                control={control}
                                                                render={({ field }) => (
                                                                    <TextareaAutosize {...field} value={field.value ?? ''} minRows={2} placeholder="Factuurregel omschrijving" disabled={isReadOnly} className="p-1 h-auto resize-none whitespace-pre-wrap bg-transparent" />
                                                                )}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="align-top py-2">
                                                             <FormField
                                                                control={control}
                                                                name={`lines.${originalIndex}.unitPrice`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormControl>
                                                                            <Input
                                                                                type="number"
                                                                                step="any"
                                                                                {...field}
                                                                                onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                                                                value={field.value ?? 0}
                                                                                placeholder="0.00"
                                                                                className={cn('text-right', tollValueIsEmpty && 'border-red-500')}
                                                                                disabled={isReadOnly}
                                                                            />
                                                                        </FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="align-top py-2">
                                                            <FormField
                                                                control={form.control}
                                                                name={`lines.${originalIndex}.vatRate`}
                                                                render={({ field }) => (
                                                                    <Select onValueChange={(value) => field.onChange(Number(value))} value={String(field.value)} disabled={isReadOnly}>
                                                                        <FormControl>
                                                                            <SelectTrigger>
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                        </FormControl>
                                                                        <SelectContent>
                                                                            {[21, 9, 0].map(rate => (
                                                                                <SelectItem key={rate} value={String(rate)}>{rate}%</SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                )}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="align-top text-right font-medium pr-4 py-2">
                                                            <div className="h-10 flex items-center justify-end">
                                                                {formatCurrency(lineTotal)}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="align-top py-2">
                                                             {!isReadOnly && (
                                                                <Button type="button" variant="ghost" size="icon" onClick={() => remove(originalIndex)} className="text-muted-foreground hover:text-destructive mt-1">
                                                                    <Trash2 className="h-4 w-4"/>
                                                                </Button>
                                                             )}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                    {!isReadOnly && (
                                        <Button type="button" variant="outline" size="sm" onClick={() => append({ description: '', quantity: 1, unitPrice: 0, vatRate: 21, total: 0 })} className="mt-4">
                                            <PlusCircle className="mr-2 h-4 w-4"/> Regel Toevoegen
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <Separator className="my-8" />
                        <div className="flex justify-end">
                            <div className="w-full max-w-sm space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Subtotaal</span>
                                    <span className="font-medium text-foreground">{formatCurrency(subTotal)}</span>
                                </div>
                                {Object.keys(vatBreakdown).map(Number).sort((a, b) => b - a).map(vatRate => {
                                    const group = vatBreakdown[vatRate];
                                    return (
                                        <div key={vatRate} className="flex justify-between">
                                            <span className="text-muted-foreground">{vatRate}% btw over {formatCurrency(group.subTotal)}</span>
                                            <span className="font-medium text-foreground">{formatCurrency(group.vatAmount)}</span>
                                        </div>
                                    );
                                })}
                                <Separator/>
                                <div className="flex justify-between text-lg font-bold">
                                    <span className="text-foreground">Totaal</span>
                                    <span className={cn("text-primary", grandTotal < 0 && "text-destructive")}>{formatCurrency(grandTotal)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 text-center text-xs text-muted-foreground">
                            <FormField control={form.control} name="footerText" render={({field}) => (
                                <FormItem>
                                    <FormControl><Textarea {...field} value={field.value ?? ''} disabled={isReadOnly} className="text-xs text-muted-foreground text-center border-0 p-0 h-auto" /></FormControl>
                                </FormItem>
                            )}/>
                        </div>
                    </CardContent>
                </Card>
                </form>
            </Form>
        </div>
        </div>
    );
}



