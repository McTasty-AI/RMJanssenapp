

"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerSchema, type CustomerFormData } from '@/lib/schemas';
import type { Customer, BillingType, MileageRateType, Vehicle } from '@/lib/types';
type LicensePlate = string;
import { billingTypes, billingTypeTranslations, surchargeOptions, mileageRateTypes, mileageRateTypeTranslations } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';
import { mapAppToSupabase, mapSupabaseToApp } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PlusCircle, Loader2, ChevronsUpDown, FileClock, Edit, Euro, Percent, Trash2, Workflow } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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


const MultiSelectPlates = ({ customer, onUpdate, allVehicles }: { customer: Customer, onUpdate: (customerId: string, plates: LicensePlate[]) => void, allVehicles: Vehicle[] }) => {
    const assignedPlates = customer.assignedLicensePlates || [];

    const handleSelect = (plate: LicensePlate) => {
        const newPlates = assignedPlates.includes(plate)
            ? assignedPlates.filter(p => p !== plate)
            : [...assignedPlates, plate];
        if (customer.id) {
           onUpdate(customer.id, newPlates);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                    <span className="truncate pr-2">
                        {assignedPlates.length > 0 ? assignedPlates.join(', ') : 'Kies kentekens'}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                <DropdownMenuLabel>Beschikbare Kentekens</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allVehicles.map(vehicle => (
                    <DropdownMenuCheckboxItem
                        key={vehicle.id}
                        checked={assignedPlates.includes(vehicle.licensePlate)}
                        onCheckedChange={() => handleSelect(vehicle.licensePlate)}
                        onSelect={(e) => e.preventDefault()} // Prevents menu from closing
                    >
                        {vehicle.licensePlate}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};


export default function AdminCustomersPage() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const { toast } = useToast();

    const form = useForm<CustomerFormData>({
        resolver: zodResolver(customerSchema),
        defaultValues: {
            companyName: '',
            kvkNumber: '',
            street: '',
            houseNumber: '',
            postalCode: '',
            city: '',
            contactName: '',
            contactEmail: '',
            assignedLicensePlates: [],
            paymentTerm: 30,
            billingType: 'combined',
            mileageRateType: 'dot',
            hourlyRate: 0,
            mileageRate: 0,
            overnightRate: 0,
            dailyExpenseAllowance: 0,
            saturdaySurcharge: 100,
            sundaySurcharge: 100,
            showDailyTotals: false,
            showWeeklyTotals: false,
            showWorkTimes: false,
        }
    });
    
    const billingType = form.watch('billingType');
    const mileageRateType = form.watch('mileageRateType');

    const fetchCustomers = useCallback(async () => {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .order('company_name', { ascending: true })
            .limit(50);
        if (error) {
            console.error('Error fetching customers:', error);
            toast({ variant: 'destructive', title: 'Fout bij ophalen klanten' });
            return;
        }
        const mapped = (data || []).map(row => mapSupabaseToApp<Customer>(row));
        setCustomers(mapped);
    }, [toast]);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        const fetchVehicles = async () => {
            const { data, error } = await supabase
                .from('vehicles')
                .select('*');
            if (!isMounted) return;
            if (error) {
                console.error('Error fetching vehicles:', error);
                toast({ variant: 'destructive', title: 'Fout bij ophalen voertuigen' });
                return;
            }
            const mapped = (data || []).map(row => mapSupabaseToApp<Vehicle>(row));
            setVehicles(mapped.filter(v => v.status !== 'Inactief' && v.status !== 'Verkocht'));
        };

        Promise.all([fetchCustomers(), fetchVehicles()]).finally(() => isMounted && setLoading(false));

        const customersChannel = supabase
            .channel('customers-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchCustomers)
            .subscribe();
        const vehiclesChannel = supabase
            .channel('vehicles-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, fetchVehicles)
            .subscribe();

        return () => { isMounted = false; customersChannel.unsubscribe(); vehiclesChannel.unsubscribe(); };
    }, [toast, fetchCustomers]);
    
    const handleOpenDialog = (customer: Customer | null = null) => {
        setEditingCustomer(customer);
        if (customer) {
            form.reset({
                ...customer,
                paymentTerm: customer.paymentTerm ?? 30,
                billingType: customer.billingType ?? 'combined',
                mileageRateType: customer.mileageRateType ?? 'dot',
                hourlyRate: customer.hourlyRate ?? 0,
                mileageRate: customer.mileageRate ?? 0,
                overnightRate: customer.overnightRate ?? 0,
                dailyExpenseAllowance: customer.dailyExpenseAllowance ?? 0,
                saturdaySurcharge: customer.saturdaySurcharge ?? 100,
                sundaySurcharge: customer.sundaySurcharge ?? 100,
                showDailyTotals: customer.showDailyTotals ?? false,
                showWeeklyTotals: customer.showWeeklyTotals ?? false,
                showWorkTimes: customer.showWorkTimes ?? false,
            });
        } else {
            form.reset({
                companyName: '', kvkNumber: '', street: '', houseNumber: '', postalCode: '',
                city: '', contactName: '', contactEmail: '', assignedLicensePlates: [], paymentTerm: 30,
                billingType: 'combined', mileageRateType: 'dot', hourlyRate: 0, mileageRate: 0, overnightRate: 0,
                dailyExpenseAllowance: 0,
                saturdaySurcharge: 100, sundaySurcharge: 100,
                showDailyTotals: false, showWeeklyTotals: false, showWorkTimes: false,
            });
        }
        setIsDialogOpen(true);
    };

    const handlePlatesChange = async (customerId: string, plates: LicensePlate[]) => {
        if (!customerId) return;
        try {
            const { error } = await supabase
                .from('customers')
                .update({ assigned_license_plates: plates })
                .eq('id', customerId);
            if (error) throw error;
            
            // Update local state immediately for instant UI feedback
            setCustomers(prevCustomers => 
                prevCustomers.map(customer => 
                    customer.id === customerId 
                        ? { ...customer, assignedLicensePlates: plates }
                        : customer
                )
            );
            
            toast({ title: 'Kentekens bijgewerkt', description: 'De kentekens voor de klant zijn opgeslagen.' });
        } catch (error) {
            console.error('Error updating customer plates:', error);
            toast({ variant: 'destructive', title: 'Update Mislukt' });
        }
    };

    const onSubmit = async (data: CustomerFormData) => {
        const dataToSave: Omit<CustomerFormData, 'saturdaySurcharge' | 'sundaySurcharge'> & { saturdaySurcharge?: number, sundaySurcharge?: number } = {
            ...data,
            paymentTerm: data.paymentTerm ?? undefined,
            hourlyRate: data.billingType === 'hourly' || data.billingType === 'combined' ? data.hourlyRate : undefined,
            mileageRate: data.billingType === 'mileage' || data.billingType === 'combined' ? data.mileageRate : undefined,
            saturdaySurcharge: Number(data.saturdaySurcharge),
            sundaySurcharge: Number(data.sundaySurcharge),
        };

        try {
            if (editingCustomer) {
                const payload = mapAppToSupabase(dataToSave);
                const { error } = await supabase
                    .from('customers')
                    .update(payload)
                    .eq('id', editingCustomer.id);
                if (error) throw error;
                toast({ title: 'Klant Bijgewerkt', description: `De gegevens van ${data.companyName} zijn succesvol bijgewerkt.` });
            } else {
                if (data.kvkNumber) {
                    const { data: dup, error: dupErr } = await supabase
                        .from('customers')
                        .select('id')
                        .eq('kvk_number', data.kvkNumber)
                        .limit(1);
                    if (dupErr) throw dupErr;
                    if (dup && dup.length > 0) {
                        toast({ variant: 'destructive', title: 'KVK-nummer bestaat al', description: 'Er is al een klant met dit KVK-nummer.' });
                        return;
                    }
                }
                const payload = mapAppToSupabase({ ...dataToSave, createdAt: new Date().toISOString() });
                const { error } = await supabase.from('customers').insert(payload);
                if (error) throw error;
                toast({ title: 'Klant Opgeslagen', description: `Klant ${data.companyName} is succesvol toegevoegd.` });
            }

            // Refresh the customers list after create or update
            await fetchCustomers();

            form.reset();
            setIsDialogOpen(false);
            setEditingCustomer(null);
        } catch (error) {
            console.error('Error saving customer:', error);
            toast({ variant: 'destructive', title: 'Opslaan Mislukt', description: 'Er is een onverwachte fout opgetreden.' });
        }
    };
    
     const handleDeleteCustomer = async () => {
        if (!customerToDelete) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('customers')
                .delete()
                .eq('id', customerToDelete.id);
            if (error) throw error;
            toast({ title: 'Klant verwijderd', description: `Klant ${customerToDelete.companyName} is succesvol verwijderd.` });
            // Refresh the customers list
            await fetchCustomers();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Verwijderen mislukt', description: 'Er is een fout opgetreden bij het verwijderen van de klant.' });
        } finally {
            setIsDeleting(false);
            setIsDeleteAlertOpen(false);
            setCustomerToDelete(null);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8">
             <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Klantenbeheer</h1>
                    <p className="text-muted-foreground">Voeg hier nieuwe klanten toe en beheer bestaande klantgegevens.</p>
                </div>
                <Button onClick={() => handleOpenDialog()}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nieuwe Klant
                </Button>
            </div>
             <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingCustomer ? 'Klant Bewerken' : 'Nieuwe Klant Toevoegen'}</DialogTitle>
                        <DialogDescription>
                            {editingCustomer ? 'Pas de gegevens van de klant aan.' : 'Voer de gegevens van de nieuwe klant in.'}
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <Tabs defaultValue="general">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="general">Algemeen</TabsTrigger>
                                    <TabsTrigger value="financial">Financieel</TabsTrigger>
                                    <TabsTrigger value="workflow">Factuur Workflow</TabsTrigger>
                                </TabsList>
                                <TabsContent value="general" className="pt-4 space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="companyName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Bedrijfsnaam</FormLabel>
                                                <FormControl><Input placeholder="R&M Janssen Transport" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="kvkNumber"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>KVK-nummer</FormLabel>
                                                <FormControl><Input placeholder="12345678" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                                        <FormField
                                            control={form.control}
                                            name="street"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Straat</FormLabel>
                                                    <FormControl><Input placeholder="Voorbeeldstraat" {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="houseNumber"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Huisnummer</FormLabel>
                                                    <FormControl><Input placeholder="123" {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="postalCode"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Postcode</FormLabel>
                                                    <FormControl><Input placeholder="1234 AB" {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                         <FormField
                                            control={form.control}
                                            name="city"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Stad</FormLabel>
                                                    <FormControl><Input placeholder="Amsterdam" {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <hr/>
                                    <div className="grid grid-cols-2 gap-4">
                                         <FormField
                                            control={form.control}
                                            name="contactName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Naam contactpersoon</FormLabel>
                                                    <FormControl><Input placeholder="Jan Jansen" {...field} value={field.value ?? ''} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="contactEmail"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Email contactpersoon</FormLabel>
                                                    <FormControl><Input placeholder="j.jansen@voorbeeld.nl" {...field} value={field.value ?? ''} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </TabsContent>
                                <TabsContent value="financial" className="pt-4 space-y-6">
                                     <FormField
                                        control={form.control}
                                        name="billingType"
                                        render={({ field }) => (
                                            <FormItem className="space-y-3">
                                                <FormLabel>Facturatietype</FormLabel>
                                                <FormControl>
                                                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                                                        {billingTypes.map(type => (
                                                            <FormItem key={type} className="flex items-center space-x-3 space-y-0">
                                                                <FormControl>
                                                                    <RadioGroupItem value={type} />
                                                                </FormControl>
                                                                <FormLabel className="font-normal">{billingTypeTranslations[type]}</FormLabel>
                                                            </FormItem>
                                                        ))}
                                                    </RadioGroup>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {(billingType === 'mileage' || billingType === 'combined') && (
                                        <FormField
                                            control={form.control}
                                            name="mileageRateType"
                                            render={({ field }) => (
                                            <FormItem className="space-y-3">
                                                <FormLabel>Type Kilometertarief</FormLabel>
                                                <FormControl>
                                                <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col space-y-1">
                                                    {mileageRateTypes.map((type) => (
                                                    <FormItem key={type} className="flex items-center space-x-3 space-y-0">
                                                        <FormControl>
                                                        <RadioGroupItem value={type} />
                                                        </FormControl>
                                                        <FormLabel className="font-normal">{mileageRateTypeTranslations[type]}</FormLabel>
                                                    </FormItem>
                                                    ))}
                                                </RadioGroup>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                    )}
                                    <div className="grid grid-cols-2 gap-4">
                                        {(billingType === 'hourly' || billingType === 'combined') && (
                                            <FormField
                                                control={form.control}
                                                name="hourlyRate"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Uurtarief</FormLabel>
                                                        <div className="relative">
                                                            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                            <FormControl>
                                                                <Input type="number" placeholder="45.00" {...field} value={field.value ?? ''} onChange={e => field.onChange(Number(e.target.value))} className="pl-9" />
                                                            </FormControl>
                                                        </div>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                        {(billingType === 'mileage' || billingType === 'combined') && (mileageRateType === 'dot' || mileageRateType === 'fixed') && (
                                            <FormField
                                                control={form.control}
                                                name="mileageRate"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Basis Kilometertarief</FormLabel>
                                                         <div className="relative">
                                                            <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                            <FormControl>
                                                                <Input type="number" placeholder="0.56" {...field} value={field.value ?? ''} onChange={e => field.onChange(Number(e.target.value))} className="pl-9" />
                                                            </FormControl>
                                                        </div>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="overnightRate"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Overnachtingstarief</FormLabel>
                                                        <div className="relative">
                                                        <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <FormControl>
                                                            <Input type="number" placeholder="50.00" {...field} value={field.value ?? ''} onChange={e => field.onChange(Number(e.target.value))} className="pl-9" />
                                                        </FormControl>
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="dailyExpenseAllowance"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Dagelijkse Onkostenvergoeding</FormLabel>
                                                        <div className="relative">
                                                        <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <FormControl>
                                                            <Input type="number" placeholder="15.00" {...field} value={field.value ?? ''} onChange={e => field.onChange(Number(e.target.value))} className="pl-9" />
                                                        </FormControl>
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="saturdaySurcharge"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Toeslag Zaterdag</FormLabel>
                                                    <Select onValueChange={(val) => field.onChange(Number(val))} value={String(field.value)}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <Percent className="mr-2 h-4 w-4" />
                                                                <SelectValue placeholder="Selecteer toeslag" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {surchargeOptions.map(opt => <SelectItem key={opt} value={String(opt)}>{opt}%</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="sundaySurcharge"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Toeslag Zondag</FormLabel>
                                                      <Select onValueChange={(val) => field.onChange(Number(val))} value={String(field.value)}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <Percent className="mr-2 h-4 w-4" />
                                                                <SelectValue placeholder="Selecteer toeslag" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {surchargeOptions.map(opt => <SelectItem key={opt} value={String(opt)}>{opt}%</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </TabsContent>
                                 <TabsContent value="workflow" className="pt-4 space-y-6">
                                     <FormField
                                        control={form.control}
                                        name="paymentTerm"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Betaaltermijn (dagen)</FormLabel>
                                                 <div className="relative">
                                                    <FileClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                    <FormControl>
                                                        <Input type="number" placeholder="30" {...field} value={field.value ?? ''} onChange={e => field.onChange(Number(e.target.value))} className="pl-9" />
                                                    </FormControl>
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="showDailyTotals"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                                <div className="space-y-1 leading-none">
                                                    <FormLabel>
                                                        Dagtotalen tonen op factuur
                                                    </FormLabel>
                                                    <p className="text-sm text-muted-foreground">
                                                        Toont een subtotaal voor uren en kilometers na elke dag.
                                                    </p>
                                                </div>
                                            </FormItem>
                                        )}
                                    />
                                     <FormField
                                        control={form.control}
                                        name="showWeeklyTotals"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                                <div className="space-y-1 leading-none">
                                                    <FormLabel>
                                                        Weektotalen tonen op factuur
                                                    </FormLabel>
                                                     <p className="text-sm text-muted-foreground">
                                                        Toont een samenvatting van totale uren en kilometers onderaan de factuur.
                                                    </p>
                                                </div>
                                            </FormItem>
                                        )}
                                    />
                                     <FormField
                                        control={form.control}
                                        name="showWorkTimes"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                                <div className="space-y-1 leading-none">
                                                    <FormLabel>
                                                        Begintijd/Eindtijd/Pauze tonen op factuur
                                                    </FormLabel>
                                                     <p className="text-sm text-muted-foreground">
                                                        Voegt de gewerkte tijden toe aan de omschrijving van de uren-regel.
                                                    </p>
                                                </div>
                                            </FormItem>
                                        )}
                                    />

                                </TabsContent>
                            </Tabs>
                             <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="ghost" disabled={form.formState.isSubmitting} onClick={() => setIsDialogOpen(false)}>Annuleren</Button></DialogClose>
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting && <Loader2 className="animate-spin mr-2" />}
                                    Opslaan
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Bedrijfsnaam</TableHead>
                                <TableHead>Adres</TableHead>
                                <TableHead>Contactpersoon</TableHead>
                                <TableHead className="w-[150px]">Betaaltermijn</TableHead>
                                <TableHead className="w-[250px]">Toegewezen Kentekens</TableHead>
                                <TableHead className="w-[100px] text-right">Acties</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                                        <TableCell><Skeleton className="h-10 w-24 ml-auto" /></TableCell>
                                    </TableRow>
                                ))
                            ) : customers.length > 0 ? (
                                customers.map(customer => (
                                    <TableRow key={customer.id}>
                                        <TableCell className="font-medium">{customer.companyName}</TableCell>
                                        <TableCell>{customer.street} {customer.houseNumber}, {customer.city}</TableCell>
                                        <TableCell>
                                            {customer.contactName ? (
                                                <div>
                                                    <p>{customer.contactName}</p>
                                                    <a href={`mailto:${customer.contactEmail}`} className="text-sm text-muted-foreground hover:text-primary">{customer.contactEmail}</a>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {customer.paymentTerm ? `${customer.paymentTerm} dagen` : '-'}
                                        </TableCell>
                                        <TableCell>
                                            <MultiSelectPlates customer={customer} onUpdate={handlePlatesChange} allVehicles={vehicles} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(customer)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => { setCustomerToDelete(customer); setIsDeleteAlertOpen(true); }}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24">
                                        Nog geen klanten toegevoegd.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            
            <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Deze actie kan niet ongedaan worden gemaakt. Dit zal de klant <strong>{customerToDelete?.companyName}</strong> permanent verwijderen.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setCustomerToDelete(null)}>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteCustomer} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isDeleting ? 'Verwijderen...' : 'Verwijderen'}
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

    
