

"use client";

import { useState, useEffect, useMemo } from 'react';
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, Save } from 'lucide-react';

import { supabase } from '@/lib/supabase/client';
import type { Customer, WeeklyLog, User, InvoiceLine, CompanyProfile } from '@/lib/types';
import { invoiceFormSchema, type InvoiceFormData } from '@/lib/schemas';
import { format, addDays, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { generateInvoiceLinesFromWeeklyLog } from '@/lib/invoice-service';
import { Separator } from '@/components/ui/separator';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TextareaAutosize } from '@/components/ui/textarea-autosize';
import { cn, mapSupabaseToApp, parseTimeString, parseIntervalString } from '@/lib/utils';


const formatCurrency = (amount: number) => {
    return `€ ${amount.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function NewInvoicePage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [relevantLogs, setRelevantLogs] = useState<WeeklyLog[]>([]);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

    const [loadingCustomers, setLoadingCustomers] = useState(true);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadingWeeks, setLoadingWeeks] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    
    const form = useForm<InvoiceFormData>({
        resolver: zodResolver(invoiceFormSchema),
        defaultValues: {
            customerId: '',
            userId: '',
            weekId: '',
            customer: {
                companyName: '',
                street: '',
                houseNumber: '',
                postalCode: '',
                city: '',
                kvkNumber: '',
                contactName: '',
            },
            invoiceDate: new Date(),
            dueDate: addDays(new Date(), 30),
            lines: [],
            reference: '',
            footerText: 'We verzoeken u vriendelijk het bovenstaande bedrag voor de vervaldatum te voldoen op onze bankrekening onder vermelding van het factuurnummer.',
            showDailyTotals: false,
            showWeeklyTotals: false,
        }
    });

    const { control, formState: { isSubmitting } } = form;

    const { fields, append, remove, replace } = useFieldArray({
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
        let mounted = true;
        supabase
          .from('customers')
          .select('*')
          .order('company_name')
          .then(({ data, error }) => {
            if (!mounted) return;
            if (error) return;
            setCustomers((data || []).map(r => { const base = mapSupabaseToApp(r) as any; return { ...base, id: r.id } as Customer; }) as Customer[]);
            setLoadingCustomers(false);
          });
        const ch = supabase
          .channel('customers-changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
            supabase.from('customers').select('*').order('company_name').then(({ data }) => {
              setCustomers((data || []).map(r => { const base = mapSupabaseToApp(r) as any; return { ...base, id: r.id } as Customer; }) as Customer[]);
            });
          })
          .subscribe();
        return () => { mounted = false; ch.unsubscribe(); };
    }, []);

    useEffect(() => {
        let mounted = true;
        supabase
          .from('profiles')
          .select('*')
          .order('first_name')
          .then(({ data, error }) => {
            if (!mounted) return;
            if (error) return;
            setAllUsers((data || []).map(r => ({ uid: r.id, ...mapSupabaseToApp(r) })) as User[]);
            setLoadingUsers(false);
          });
        const ch = supabase
          .channel('profiles-changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
            supabase.from('profiles').select('*').order('first_name').then(({ data }) => {
              setAllUsers((data || []).map(r => ({ uid: r.id, ...mapSupabaseToApp(r) })) as User[]);
            });
          })
          .subscribe();
        return () => { mounted = false; ch.unsubscribe(); };
    }, []);

    const selectedCustomerId = form.watch('customerId');
    const selectedUserId = form.watch('userId');
    const selectedWeekId = form.watch('weekId');

    // Effect to auto-fill reference field
    useEffect(() => {
        if (!selectedWeekId || !selectedUserId) {
            form.setValue('reference', '');
            return;
        }

        const weeklyLog = relevantLogs.find(w => w.weekId === selectedWeekId && w.userId === selectedUserId);
        if (weeklyLog) {
            const [year, weekNumber] = selectedWeekId.split('-');
            
            const plateCounts: Record<string, number> = {};
            weeklyLog.days.forEach(day => {
                if (day.licensePlate) {
                    plateCounts[day.licensePlate] = (plateCounts[day.licensePlate] || 0) + 1;
                }
            });

            const mostUsedPlate = Object.keys(plateCounts).length > 0
                ? Object.keys(plateCounts).reduce((a, b) => plateCounts[a] > plateCounts[b] ? a : b)
                : '';

            form.setValue('reference', `Week ${weekNumber} - ${year} (${mostUsedPlate})`);
        }

    }, [selectedWeekId, selectedUserId, relevantLogs, form]);

    
    // Effect to auto-fill customer details
    useEffect(() => {
        const customer = customers.find(c => c.id === selectedCustomerId);
        if (customer) {
            form.setValue('customer.companyName', customer.companyName);
            form.setValue('customer.street', customer.street);
            form.setValue('customer.houseNumber', customer.houseNumber);
            form.setValue('customer.postalCode', customer.postalCode);
            form.setValue('customer.city', customer.city);
            form.setValue('customer.kvkNumber', customer.kvkNumber);
            form.setValue('customer.contactName', customer.contactName || '');
            form.setValue('showDailyTotals', customer.showDailyTotals ?? false);
            form.setValue('showWeeklyTotals', customer.showWeeklyTotals ?? false);
            const paymentTerm = customer.paymentTerm ?? 30;
            form.setValue('dueDate', addDays(new Date(), paymentTerm));
        }
    }, [selectedCustomerId, customers, form]);


    // Effect to fetch relevant logs when customer changes
    useEffect(() => {
        if (!selectedCustomerId) { setRelevantLogs([]); return; }
        const cust = customers.find(c => c.id === selectedCustomerId);
        if (!cust || !cust.assignedLicensePlates || cust.assignedLicensePlates.length === 0) { setRelevantLogs([]); return; }
        setLoadingWeeks(true);
        let mounted = true;
        const fetchLogs = async () => {
            const { data, error } = await supabase
              .from('weekly_logs')
              .select('*, daily_logs(*)')
              .eq('status', 'approved')
              .order('week_id', { ascending: false });
            if (!mounted) return;
            if (error) {
                console.error('Error loading weekstates:', error);
                toast({ variant: 'destructive', title: 'Fout bij laden weekstaten' });
                setLoadingWeeks(false);
                return;
            }
            const mapped: WeeklyLog[] = (data || []).map((w: any) => ({
                weekId: w.week_id,
                userId: w.user_id,
                days: (w.daily_logs || []).map((dl: any) => ({
                    date: dl.date,
                    day: dl.day_name,
                    status: dl.status,
                    startTime: parseTimeString(dl.start_time) || { hour: 0, minute: 0 },
                    endTime: parseTimeString(dl.end_time) || { hour: 0, minute: 0 },
                    breakTime: parseIntervalString(dl.break_time) || { hour: 0, minute: 0 },
                    startMileage: dl.start_mileage || 0,
                    endMileage: dl.end_mileage || 0,
                    toll: (dl.toll as any) || ('Geen' as any),
                    licensePlate: dl.license_plate,
                    overnightStay: dl.overnight_stay || false,
                    tripNumber: dl.trip_number || '',
                })),
                status: w.status,
                remarks: w.remarks || '',
            }));
            const plates = cust.assignedLicensePlates!;
            const filtered = mapped.filter(log => log.days.some(d => d.licensePlate && plates.includes(d.licensePlate!)));
            setRelevantLogs(filtered);
            setLoadingWeeks(false);
        };
        fetchLogs();
        const ch = supabase
          .channel('weekly-logs-changes-new')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_logs' }, fetchLogs)
          .subscribe();
        return () => { mounted = false; ch.unsubscribe(); };
    }, [selectedCustomerId, customers, toast]);

    const relevantUsers = useMemo(() => {
        if (loadingUsers || relevantLogs.length === 0) return [];
        const userIdsWithLogs = new Set(relevantLogs.map(log => log.userId));
        return allUsers.filter(user => user.uid && userIdsWithLogs.has(user.uid));
    }, [relevantLogs, allUsers, loadingUsers]);

    const approvedWeeksForUser = useMemo(() => {
        if (!selectedUserId) return [];
        return relevantLogs
            .filter(log => log.userId === selectedUserId)
            .sort((a,b) => b.weekId.localeCompare(a.weekId));
    }, [selectedUserId, relevantLogs]);
    
    
    const handleGenerate = async () => {
        const { weekId, userId, customerId } = form.getValues();
        const weeklyLog = relevantLogs.find(w => w.weekId === weekId && w.userId === userId);
        const customer = customers.find(c => c.id === customerId);

        if (!weeklyLog || !customer) {
            toast({ variant: 'destructive', title: 'Selectie onvolledig', description: 'Kies een klant en een geldige weekstaat.' });
            return;
        }

        setIsGenerating(true);
        
        try {
             // Fetch the weekly rate before calling the AI flow
            let weeklyRate: number | undefined = undefined;
            if (customer.mileageRateType === 'dot' || customer.mileageRateType === 'variable') {
                const { data: rateRow } = await supabase
                    .from('weekly_rates')
                    .select('rate')
                    .eq('week_id', weeklyLog.weekId)
                    .eq('customer_id', customer.id)
                    .single();
                if (rateRow) {
                    weeklyRate = rateRow.rate as number;
                } else {
                    console.warn(`Weekly rate for customer ${customer.companyName} not found for week ${weeklyLog.weekId}.`);
                    toast({ variant: 'destructive', title: 'Tarief niet gevonden', description: `Wekelijks tarief voor ${customer.companyName} in week ${weeklyLog.weekId.split('-')[1]} is niet ingevuld. Basistarief wordt gebruikt.`});
                }
            }
            
            // Use centralized service to generate invoice lines
            const invoiceLines = await generateInvoiceLinesFromWeeklyLog(weeklyLog, customer, weeklyRate);
            const linesWithTotal = invoiceLines.map(line => ({
                ...line,
                total: line.quantity * line.unitPrice
            }));
            replace(linesWithTotal as any);
            toast({
                title: "Factuurregels gegenereerd!",
                description: "De factuur is gevuld met de gegevens uit de weekstaat. Controleer en pas aan waar nodig.",
            });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Genereren Mislukt', description: 'Kon de data niet ophalen uit de weekstaat.' });
        } finally {
            setIsGenerating(false);
        }
    };

    const watchedLines = useWatch({ control, name: 'lines' });
    const { subTotal, vatTotal, grandTotal } = useMemo(() => {
        return (watchedLines || []).reduce((acc, line) => {
            const lineTotal = (line.quantity || 0) * (Number(line.unitPrice) || 0);
            const vatAmount = lineTotal * ((line.vatRate || 0) / 100);
            acc.subTotal += lineTotal;
            acc.vatTotal += vatAmount;
            acc.grandTotal = acc.subTotal + acc.vatTotal;
            return acc;
        }, { subTotal: 0, vatTotal: 0, grandTotal: 0 });
    }, [watchedLines]);

    const onSave = async (data: InvoiceFormData) => {
        try {
            const { data: inserted, error } = await supabase
              .from('invoices')
              .insert({
                invoice_number: data.invoiceNumber || '',
                status: 'concept',
                customer_id: data.customerId || null,
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
              .select('*')
              .single();
            if (error || !inserted) throw error;

            if (data.lines && data.lines.length > 0) {
              const rows = data.lines.map(l => ({
                invoice_id: inserted.id,
                quantity: l.quantity || 0,
                description: l.description,
                unit_price: Number(l.unitPrice) || 0,
                vat_rate: (Number.isFinite(Number(l.vatRate)) ? Number(l.vatRate) : 21),
                total: (l.quantity || 0) * (Number(l.unitPrice) || 0),
              }));
              const { error: linesErr } = await supabase.from('invoice_lines').insert(rows);
              if (linesErr) throw linesErr;
            }

            toast({ title: 'Factuur opgeslagen als concept' });
            router.push('/invoices');
        } catch (error) {
            console.error('Error saving invoice:', error);
            toast({ variant: 'destructive', title: 'Opslaan mislukt' });
        }
    };


    return (
        <div className="bg-muted/30 min-h-screen">
        <div className="space-y-8">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSave)}>
                 <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">Nieuwe Factuur</h1>
                        <p className="text-muted-foreground">Stel hier een nieuwe factuur op.</p>
                    </div>
                     <div className='flex gap-2'>
                         <Button type="button" variant="outline" onClick={() => router.push('/invoices')}>
                            Annuleren
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-4 w-4" />}
                            Opslaan als Concept
                        </Button>
                     </div>
                 </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                        <div className="lg:col-span-2 space-y-6">
                            <Card className="shadow-lg">
                                <CardContent className="p-10">
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
                                             <div className="space-y-4 mt-24">
                                                <h1 className="text-4xl font-bold text-foreground">FACTUUR</h1>
                                                <div className="space-y-1 text-sm">
                                                    <p><span className="font-medium text-muted-foreground">Datum:</span> {format(form.getValues('invoiceDate'), 'dd-MM-yyyy')}</p>
                                                    <p><span className="font-medium text-muted-foreground">Vervaldatum:</span> {format(form.getValues('dueDate'), 'dd-MM-yyyy')}</p>
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
                                    
                                    <Separator className="my-8" />

                                    <div className="grid grid-cols-2 gap-8 mb-8">
                                        <div>
                                            <p className="font-semibold text-foreground mb-2">Factuur aan:</p>
                                            <div className="space-y-1">
                                                <FormField control={form.control} name="customer.companyName" render={({field}) => (
                                                    <FormItem><FormControl><Input placeholder="Bedrijfsnaam" {...field} className="text-md font-bold border-0 px-1 h-auto" /></FormControl></FormItem>
                                                )}/>
                                                <div className="flex gap-2">
                                                    <FormField control={form.control} name="customer.street" render={({field}) => (
                                                        <FormItem className="flex-grow"><FormControl><Input placeholder="Straat" {...field} className="text-sm text-muted-foreground border-0 px-1 h-auto" /></FormControl></FormItem>
                                                    )}/>
                                                    <FormField control={form.control} name="customer.houseNumber" render={({field}) => (
                                                        <FormItem><FormControl><Input placeholder="Nr" {...field} className="text-sm text-muted-foreground border-0 px-1 h-auto w-16" /></FormControl></FormItem>
                                                    )}/>
                                                </div>
                                                <div className="flex gap-2">
                                                    <FormField control={form.control} name="customer.postalCode" render={({field}) => (
                                                        <FormItem><FormControl><Input placeholder="Postcode" {...field} className="text-sm text-muted-foreground border-0 px-1 h-auto w-24" /></FormControl></FormItem>
                                                    )}/>
                                                    <FormField control={form.control} name="customer.city" render={({field}) => (
                                                        <FormItem className="flex-grow"><FormControl><Input placeholder="Stad" {...field} className="text-sm text-muted-foreground border-0 px-1 h-auto" /></FormControl></FormItem>
                                                    )}/>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                             <FormField control={form.control} name="invoiceNumber" render={({field}) => (
                                                <FormItem>
                                                    <FormLabel className="font-semibold text-foreground">Factuurnummer</FormLabel>
                                                    <FormControl><Input placeholder="Wordt automatisch gegenereerd..." {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}/>
                                             <FormField control={form.control} name="reference" render={({field}) => (
                                                <FormItem>
                                                    <FormLabel className="font-semibold text-foreground">Kenmerk</FormLabel>
                                                    <FormControl><Input {...field} value={field.value ?? ''} placeholder="Optioneel kenmerk" /></FormControl>
                                                </FormItem>
                                            )}/>
                                        </div>
                                    </div>

                                    <div className="mt-8 flow-root">
                                        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                                            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className="w-[100px]">Aantal</TableHead>
                                                            <TableHead className="w-2/5">Omschrijving</TableHead>
                                                            <TableHead className="w-[120px]">Tarief</TableHead>
                                                            <TableHead className="w-[120px] text-right">BTW %</TableHead>
                                                            <TableHead className="w-[150px] text-right">Totaal</TableHead>
                                                            <TableHead className="w-[50px]"></TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {fields.map((item, index) => {
                                                            const description = watchedLines?.[index]?.description?.toLowerCase() || '';
                                                            const isMileageRate = ['kilometers', 'km', 'dot', 'diesel'].some(keyword => description.includes(keyword));
                                                            const isTollLine = description.includes('tol');
                                                            const tollValueIsEmpty = isTollLine && (!item.quantity || !item.unitPrice);
                                                            return (
                                                            <TableRow key={item.id}>
                                                                <TableCell className="align-top">
                                                                     <Controller
                                                                        name={`lines.${index}.quantity`}
                                                                        control={control}
                                                                        defaultValue={item.quantity}
                                                                        render={({ field }) => (
                                                                            <Input
                                                                                type="number"
                                                                                {...field}
                                                                                value={field.value ?? ''}
                                                                                onChange={e => field.onChange(Number(e.target.value))}
                                                                                placeholder="1"
                                                                                className={cn(tollValueIsEmpty && 'border-red-500')}
                                                                            />
                                                                        )}
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="align-top">
                                                                    <Controller
                                                                        name={`lines.${index}.description`}
                                                                        control={control}
                                                                        defaultValue={item.description}
                                                                        render={({ field }) => (
                                                                            <TextareaAutosize {...field} value={field.value ?? ''} minRows={2} placeholder="Factuurregel omschrijving" className="p-1 h-auto resize-none whitespace-pre-wrap bg-transparent" />
                                                                        )}
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="align-top">
                                                                    <Controller
                                                                        name={`lines.${index}.unitPrice`}
                                                                        control={control}
                                                                        defaultValue={item.unitPrice}
                                                                        render={({ field }) => (
                                                                            <Input
                                                                                type="text"
                                                                                value={String(field.value ?? '')}
                                                                                onChange={e => field.onChange(e.target.value)}
                                                                                onBlur={(e) => {
                                                                                    const numValue = parseFloat(e.target.value);
                                                                                    if (!isNaN(numValue)) {
                                                                                        const decimals = isMileageRate ? 4 : 2;
                                                                                        field.onChange(String(numValue.toFixed(decimals)));
                                                                                    }
                                                                                }}
                                                                                placeholder="0.00"
                                                                                className={cn(tollValueIsEmpty && 'border-red-500')}
                                                                            />
                                                                        )}
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="align-top">
                                                                    <FormField
                                                                        control={form.control}
                                                                        name={`lines.${index}.vatRate`}
                                                                        defaultValue={item.vatRate}
                                                                        render={({ field }) => (
                                                                            <Select onValueChange={(value) => field.onChange(Number(value))} value={String(field.value)}>
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
                                                                <TableCell className="align-top text-right font-medium pr-4">
                                                                    <div className="h-10 flex items-center justify-end">
                                                                        {formatCurrency((watchedLines?.[index]?.quantity || 0) * (Number(watchedLines?.[index]?.unitPrice) || 0))}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="align-top">
                                                                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-muted-foreground hover:text-destructive mt-1">
                                                                        <Trash2 className="h-4 w-4"/>
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                            )
                                                        })}
                                                    </TableBody>
                                                </Table>
                                                <Button type="button" variant="outline" size="sm" onClick={() => append({ description: '', quantity: 1, unitPrice: 0, vatRate: 21, total: 0 })} className="mt-4">
                                                    <PlusCircle className="mr-2 h-4 w-4"/> Regel Toevoegen
                                                </Button>
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
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">BTW</span>
                                                <span className="font-medium text-foreground">{formatCurrency(vatTotal)}</span>
                                            </div>
                                            <Separator/>
                                            <div className="flex justify-between text-lg font-bold">
                                                <span className="text-foreground">Totaal</span>
                                                <span className="text-primary">{formatCurrency(grandTotal)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-12 text-center text-xs text-muted-foreground">
                                        <FormField control={form.control} name="footerText" render={({field}) => (
                                            <FormItem>
                                                <FormControl><Textarea {...field} value={field.value ?? ''} className="text-xs text-muted-foreground text-center border-0 p-0 h-auto" /></FormControl>
                                            </FormItem>
                                        )}/>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                        <div className="lg:col-span-1 space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Controlepaneel</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                     <FormField
                                        control={form.control}
                                        name="customerId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Klant</FormLabel>
                                                <Select onValueChange={(value) => { field.onChange(value); form.setValue('userId', ''); form.setValue('weekId', ''); }} value={field.value} disabled={loadingCustomers}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Selecteer een klant..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {customers.map(customer => <SelectItem key={customer.id} value={customer.id}>{customer.companyName}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                     <FormField
                                        control={form.control}
                                        name="userId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Medewerker</FormLabel>
                                                <Select onValueChange={(value) => { field.onChange(value); form.setValue('weekId', ''); }} value={field.value} disabled={loadingUsers || !selectedCustomerId || relevantUsers.length === 0}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Selecteer een medewerker..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {relevantUsers.map(user => <SelectItem key={user.uid} value={user.uid!}>{user.firstName} {user.lastName}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="weekId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Weekstaat</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value || ''} disabled={loadingWeeks || !selectedUserId}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Selecteer goedgekeurde week..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                     <SelectContent>
                                                        {loadingWeeks ? (
                                                             <div className="p-2 text-center text-sm text-muted-foreground">Laden...</div>
                                                        ) : approvedWeeksForUser.length > 0 ? (
                                                            approvedWeeksForUser.map(week => <SelectItem key={`${week.weekId}-${week.userId}`} value={week.weekId}>Week {week.weekId}</SelectItem>)
                                                        ) : (
                                                            <div className="p-2 text-center text-sm text-muted-foreground">Geen goedgekeurde weken</div>
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </CardContent>
                                <CardFooter>
                                    <Button type="button" onClick={handleGenerate} disabled={isGenerating || !form.getValues().weekId} className="w-full">
                                        {isGenerating ? <Loader2 className="animate-spin mr-2" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                        Vul Factuur
                                    </Button>
                                </CardFooter>
                            </Card>
                        </div>
                    </div>
                </form>
            </Form>
        </div>
        </div>
    );
}
