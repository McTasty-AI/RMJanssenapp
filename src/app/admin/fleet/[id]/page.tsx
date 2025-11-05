

"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { mapSupabaseToApp, mapAppToSupabase } from '@/lib/utils';
import type { Vehicle, WeeklyLog, PurchaseInvoice as PurchaseInvoiceType, PurchaseInvoiceCategory, VehicleDocument, InvoiceLine } from '@/lib/types';
import { purchaseInvoiceCategoryTranslations } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Truck, Gauge, Wrench, Calendar, Euro, FileText, UploadCloud, Save, Loader2, Paperclip, Trash2, CheckCircle, Calculator } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { nl } from 'date-fns/locale';
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
import Link from 'next/link';

const StatCard = ({ icon: Icon, label, value, unit, isLoading }: { icon: React.ElementType, label: string, value: string | number, unit?: string, isLoading: boolean }) => (
    <Card className="bg-muted/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            {isLoading ? (
                <Skeleton className="h-8 w-24" />
            ) : (
                <div className="text-2xl font-bold">
                    {value} {unit && <span className="text-sm font-normal text-muted-foreground">{unit}</span>}
                </div>
            )}
        </CardContent>
    </Card>
);

const vehicleDetailsSchema = z.object({
  purchaseValue: z.coerce.number().optional(),
  purchaseDate: z.date().optional().nullable(),
  monthlyLeaseAmount: z.coerce.number().optional(),
  outstandingDepreciation: z.coerce.number().optional(),
});
type VehicleDetailsFormData = z.infer<typeof vehicleDetailsSchema>;

const formatCurrency = (value?: number) => {
    if (value === undefined || isNaN(value)) return '-';
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
};


export default function VehicleDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const vehicleId = params.id as string;
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [loading, setLoading] = useState(true);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [maintenanceInvoices, setMaintenanceInvoices] = useState<PurchaseInvoiceType[]>([]);
    const { toast } = useToast();
    
    const [uploadingFile, setUploadingFile] = useState<File | null>(null);
    const [documentToDelete, setDocumentToDelete] = useState<VehicleDocument | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const form = useForm<VehicleDetailsFormData>({
        resolver: zodResolver(vehicleDetailsSchema),
        defaultValues: {
            purchaseValue: 0,
            purchaseDate: null,
            monthlyLeaseAmount: 0,
            outstandingDepreciation: 0,
        },
    });


    useEffect(() => {
        if (!vehicleId) return;
        let mounted = true;
        const fetchVehicle = async () => {
            const { data, error } = await supabase
                .from('vehicles')
                .select('*')
                .eq('id', vehicleId)
                .maybeSingle();
            if (!mounted) return;
            if (error || !data) {
                toast({ variant: 'destructive', title: 'Voertuig niet gevonden' });
                router.push('/admin/fleet');
                setLoading(false);
                return;
            }
            const vehicleData = { ...(mapSupabaseToApp(data) as any), id: data.id } as Vehicle;
            setVehicle(vehicleData);
            if (!form.formState.isDirty) {
                form.reset({
                    purchaseValue: vehicleData.purchaseValue || 0,
                    purchaseDate: vehicleData.purchaseDate ? parseISO(vehicleData.purchaseDate) : null,
                    monthlyLeaseAmount: vehicleData.monthlyLeaseAmount || 0,
                    outstandingDepreciation: vehicleData.outstandingDepreciation || 0,
                });
            }
            setLoading(false);
        };
        fetchVehicle();
        const ch = supabase
            .channel('vehicle-detail')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles', filter: `id=eq.${vehicleId}` }, fetchVehicle)
            .subscribe();
        return () => { mounted = false; ch.unsubscribe(); };
    }, [vehicleId, router, toast, form]);

    useEffect(() => {
        if (!vehicle) return;
        let mounted = true;
        const fetchLogs = async () => {
            const { data } = await supabase
                .from('weekly_logs')
                .select('*, daily_logs(*)')
                .eq('status', 'approved')
                .order('week_id', { ascending: false });
            if (!mounted) return;
            const logs = (data || []).map((w: any) => ({
                weekId: w.week_id,
                userId: w.user_id,
                days: (w.daily_logs || []).map((dl: any) => ({
                    date: dl.date,
                    day: dl.day_name,
                    status: dl.status,
                    startTime: dl.start_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                    endTime: dl.end_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                    breakTime: dl.break_time ? { hour: 0, minute: 0 } : { hour: 0, minute: 0 },
                    startMileage: dl.start_mileage || 0,
                    endMileage: dl.end_mileage || 0,
                    toll: dl.toll || 'Geen',
                    licensePlate: dl.license_plate,
                    overnightStay: dl.overnight_stay || false,
                    tripNumber: dl.trip_number || '',
                })),
                status: w.status,
            })) as WeeklyLog[];
            const vehicleLogs = logs
                .filter(log => log.days.some(day => day.licensePlate === vehicle.licensePlate))
                .sort((a,b) => b.weekId.localeCompare(a.weekId));
            setWeeklyLogs(vehicleLogs);
        };
        const fetchInvoices = async () => {
            const { data } = await supabase
                .from('purchase_invoices')
                .select('*')
                .or(`vehicle_id.eq.${vehicle.id},license_plate.eq.${vehicle.licensePlate}`)
                .order('invoice_date', { ascending: false });
            if (!mounted) return;
            const list = (data || []).map((r: any) => ({
                id: r.id,
                kenmerk: r.invoice_number || r.id,
                supplierName: String(r.supplier_id || ''),
                invoiceDate: r.invoice_date,
                dueDate: r.due_date || undefined,
                grandTotal: Number(r.total) || 0,
                status: r.status,
                createdAt: r.created_at,
            })) as PurchaseInvoiceType[];
            setMaintenanceInvoices(list);
        };
        fetchLogs();
        fetchInvoices();
        const ch1 = supabase.channel('wl_detail').on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_logs' }, fetchLogs).subscribe();
        const ch2 = supabase.channel('pi_detail').on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_invoices' }, fetchInvoices).subscribe();
        return () => { mounted = false; ch1.unsubscribe(); ch2.unsubscribe(); };

    }, [vehicle]);
    
    const latestMileage = useMemo(() => {
        let maxMileage = 0;
        weeklyLogs.forEach(log => {
            log.days.forEach(day => {
                if (day.licensePlate === vehicle?.licensePlate && day.endMileage && day.endMileage > maxMileage) {
                    maxMileage = day.endMileage;
                }
            });
        });
        return maxMileage > 0 ? maxMileage.toLocaleString('nl-NL') : '-';
    }, [weeklyLogs, vehicle]);

     const categorizedCosts = useMemo(() => {
        return maintenanceInvoices.reduce((acc, inv) => {
            const category = (inv.category || 'overig') as PurchaseInvoiceCategory;
            // Sum only the lines relevant to this vehicle
            const vehicleTotal = inv.aiResult?.lines
                ?.filter((line: InvoiceLine) => line.licensePlate === vehicle?.licensePlate)
                .reduce((sum: number, line: InvoiceLine) => sum + (line.total || 0), 0) || 0;
            
            acc[category] = (acc[category] || 0) + vehicleTotal;
            return acc;
        }, {} as Record<PurchaseInvoiceCategory, number>);
    }, [maintenanceInvoices, vehicle]);

    const totalMaintenanceCost = useMemo(() => {
        const values = Object.values(categorizedCosts as Record<string, number>) as number[];
        return values.reduce((sum: number, cost: number) => sum + cost, 0);
    }, [categorizedCosts]);
    
     const onSaveDetails = async (data: VehicleDetailsFormData) => {
        const dataToSave = {
            purchaseValue: data.purchaseValue || null,
            monthlyLeaseAmount: data.monthlyLeaseAmount || null,
            outstandingDepreciation: data.outstandingDepreciation || null,
            purchaseDate: data.purchaseDate ? data.purchaseDate.toISOString() : null,
        };
        
        try {
            const payload = mapAppToSupabase(dataToSave);
            const { error } = await supabase.from('vehicles').update(payload).eq('id', vehicleId);
            if (error) throw error;
            toast({ title: "Gegevens opgeslagen", description: "De voertuigdetails zijn bijgewerkt." });
            form.reset(data); // Reset dirty state
        } catch (error) {
            console.error("Error saving vehicle details:", error);
            toast({ variant: 'destructive', title: "Opslaan Mislukt" });
        }
    };
    
    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        toast({
            variant: 'destructive',
            title: 'Uploadfunctie Tijdelijk Uitgeschakeld',
            description: 'Het uploaden van documenten is momenteel niet mogelijk.',
        });
    };

    const handleDeleteDocument = async () => {
        if (!documentToDelete) return;
        setIsDeleting(true);
        try {
            toast({ variant: 'destructive', title: 'Verwijderen niet beschikbaar', description: 'Documentbeheer is nog niet gemigreerd.' });
        } finally {
            setIsDeleting(false);
            setDocumentToDelete(null);
        }
    };


    if (loading) {
        return (
            <div className="container mx-auto p-4 md:p-8">
                <Skeleton className="h-8 w-48 mb-8" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                </div>
                <Skeleton className="h-96 w-full mt-8" />
            </div>
        );
    }
    
    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8">
            <div>
                 <Button variant="ghost" onClick={() => router.push('/admin/fleet')} className="mb-4">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Terug naar wagenpark
                </Button>
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Truck className="h-8 w-8 text-primary" />
                            Dossier: {vehicle?.licensePlate}
                        </h1>
                        <p className="text-muted-foreground">{vehicle?.make} {vehicle?.model}</p>
                    </div>
                    <Link href={`/admin/cost-calculation?vehicleId=${vehicleId}`} className={cn(buttonVariants({ variant: 'outline' }))}>
                        <Calculator className="mr-2 h-4 w-4" />
                        Kostprijsberekening
                    </Link>
                </div>
            </div>
            
            <Tabs defaultValue="dashboard">
                 <TabsList>
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="general">Algemeen</TabsTrigger>
                </TabsList>
                <TabsContent value="dashboard" className="pt-6 space-y-6">
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                        <StatCard icon={Gauge} label="Huidige Kilometerstand" value={latestMileage} unit="km" isLoading={loading} />
                        <StatCard icon={Euro} label="Totale Kosten" value={formatCurrency(totalMaintenanceCost)} isLoading={loading} />
                        {Object.entries(categorizedCosts).map(([category, total]) => (
                            <StatCard 
                                key={category} 
                                icon={Wrench} 
                                label={purchaseInvoiceCategoryTranslations[category as PurchaseInvoiceCategory] || 'Overig'}
                                value={formatCurrency(total)} 
                                isLoading={loading} 
                            />
                        ))}
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" />Onderhoudshistorie</CardTitle>
                            <CardDescription>Overzicht van alle inkoopfacturen gekoppeld aan dit kenteken.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Factuurdatum</TableHead>
                                        <TableHead>Leverancier</TableHead>
                                        <TableHead>Categorie</TableHead>
                                        <TableHead>Factuurnummer</TableHead>
                                        <TableHead className="text-right">Bedrag</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {maintenanceInvoices.length > 0 ? (
                                        maintenanceInvoices.map(invoice => (
                                            <TableRow key={invoice.id}>
                                                <TableCell>{format(parseISO(invoice.invoiceDate), 'dd-MM-yyyy')}</TableCell>
                                                <TableCell>{invoice.supplierName}</TableCell>
                                                <TableCell>{invoice.category ? purchaseInvoiceCategoryTranslations[invoice.category] : '-'}</TableCell>
                                                <TableCell>{invoice.aiResult?.invoiceNumber || '-'}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(invoice.grandTotal)}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center h-24">
                                                Geen onderhoudsfacturen gevonden voor dit voertuig.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="general" className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Card>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSaveDetails)}>
                                    <CardHeader>
                                        <CardTitle>Financiële Gegevens</CardTitle>
                                        <CardDescription>Beheer hier de financiële details van het voertuig.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <FormField control={form.control} name="purchaseValue" render={({ field }) => (
                                            <FormItem><FormLabel>Aanschafwaarde</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} placeholder="70000" /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="purchaseDate" render={({ field }) => (
                                            <FormItem className="flex flex-col"><FormLabel>Aanschafdatum</FormLabel>
                                                <Popover><PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                            {field.value ? format(field.value, 'PPP', { locale: nl }) : <span>Kies een datum</span>}
                                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                        </Button>
                                                    </FormControl>
                                                </PopoverTrigger><PopoverContent className="w-auto p-0" align="start">
                                                    <CalendarPicker mode="single" selected={field.value || undefined} onSelect={field.onChange} initialFocus />
                                                </PopoverContent></Popover><FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="monthlyLeaseAmount" render={({ field }) => (
                                            <FormItem><FormLabel>Maandelijks Leasebedrag</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} placeholder="1500" /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="outstandingDepreciation" render={({ field }) => (
                                            <FormItem><FormLabel>Openstaande Afschrijving (boekhoudkundig)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} placeholder="35000" /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </CardContent>
                                    <CardFooter className="flex justify-end">
                                        <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
                                            {form.formState.isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-4 w-4" />}
                                            Opslaan
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Form>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Documenten</CardTitle>
                                <CardDescription>Upload en beheer hier relevante documenten. Uploadfunctie is tijdelijk uitgeschakeld.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="document-upload" className={cn(
                                        "flex w-full items-center justify-center cursor-not-allowed opacity-50",
                                        buttonVariants({ variant: "outline" })
                                    )}>
                                        <UploadCloud className="mr-2 h-4 w-4" />
                                        Kies bestand...
                                        <Input id="document-upload" type="file" onChange={handleFileChange} className="hidden" disabled />
                                    </label>
                                </div>
                                <div className="space-y-2 pt-4">
                                    {vehicle?.documents && vehicle.documents.length > 0 ? (
                                        vehicle.documents.map((doc, index) => (
                                            <div key={index} className="flex items-center justify-between p-2 border rounded-md">
                                                <div className="flex items-center gap-2">
                                                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                                                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline">
                                                        {doc.name}
                                                    </a>
                                                </div>
                                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDocumentToDelete(doc)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center">Geen documenten geüpload.</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
             <AlertDialog open={!!documentToDelete} onOpenChange={(open) => !open && setDocumentToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Document verwijderen?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Weet u zeker dat u het document <strong>{documentToDelete?.name}</strong> wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDocumentToDelete(null)}>Annuleren</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteDocument} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Verwijderen'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
