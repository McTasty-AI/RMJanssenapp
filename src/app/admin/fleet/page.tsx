

"use client";

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Vehicle, WeeklyLog, VehicleStatusOption, User, Customer } from '@/lib/types';
import { vehicleSchema } from '@/lib/schemas';
import { supabase } from '@/lib/supabase/client';
import { mapSupabaseToApp, mapAppToSupabase } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PlusCircle, Loader2, Edit, Truck, Route, Calendar as CalendarIcon, Settings, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import Link from 'next/link';

type VehicleFormData = z.infer<typeof vehicleSchema>;

export default function AdminFleetPage() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [statuses, setStatuses] = useState<VehicleStatusOption[]>([]);
    const { toast } = useToast();
    const router = useRouter();

    const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const form = useForm<VehicleFormData>({
        resolver: zodResolver(vehicleSchema),
        defaultValues: {
            licensePlate: '',
            make: '',
            model: '',
            status: 'Actief',
            purchaseValue: 0,
            purchaseDate: null,
            monthlyLeaseAmount: 0,
            outstandingDepreciation: 0,
        }
    });

    useEffect(() => {
        setLoading(true);
        let loadedCount = 0;
        const checkLoading = () => { loadedCount++; if (loadedCount === 5) setLoading(false); };

        const fetchVehicles = async () => {
            const { data, error } = await supabase
                .from('vehicles')
                .select('*')
                .order('license_plate');
            if (error) { console.error('Error fetching vehicles:', error); toast({ variant: 'destructive', title: 'Fout bij ophalen wagenpark' }); }
            setVehicles(((data || []).map(r => { const base = mapSupabaseToApp(r) as any; return { ...base, id: r.id } as Vehicle; })) as Vehicle[]);
            checkLoading();
        };
        const fetchLogs = async () => {
            const { data, error } = await supabase
                .from('weekly_logs')
                .select('*, daily_logs(*)')
                .eq('status', 'approved')
                .order('week_id', { ascending: false });
            if (error) { console.error('Error fetching logs:', error); }
            const mapped: WeeklyLog[] = (data || []).map((w: any) => ({
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
            }));
            setWeeklyLogs(mapped);
            checkLoading();
        };
        const fetchStatuses = async () => {
            const { data } = await supabase.from('vehicle_statuses').select('*').order('label');
            setStatuses(((data || []).map(r => ({ id: r.id, label: r.label, isDefault: r.is_default })) as VehicleStatusOption[]));
            checkLoading();
        };
        const fetchUsers = async () => {
            const { data } = await supabase.from('profiles').select('*').order('first_name');
            setUsers(((data || []).map(r => { const base = mapSupabaseToApp(r) as any; return { ...base, uid: r.id } as User; })) as User[]);
            checkLoading();
        };
        const fetchCustomers = async () => {
            const { data } = await supabase.from('customers').select('*').order('company_name');
            setCustomers(((data || []).map(r => { const base = mapSupabaseToApp(r) as any; return { ...base, id: r.id } as Customer; })) as Customer[]);
            checkLoading();
        };

        fetchVehicles(); fetchLogs(); fetchStatuses(); fetchUsers(); fetchCustomers();

        const subs = [
            supabase.channel('vehicles').on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, fetchVehicles).subscribe(),
            supabase.channel('weekly_logs').on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_logs' }, fetchLogs).subscribe(),
            supabase.channel('vehicle_statuses').on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_statuses' }, fetchStatuses).subscribe(),
            supabase.channel('profiles').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchUsers).subscribe(),
            supabase.channel('customers').on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchCustomers).subscribe(),
        ];

        return () => { subs.forEach(ch => ch.unsubscribe()); };

    }, [toast]);
    
    const latestMileageMap = useMemo(() => {
        const mileageMap = new Map<string, number>();
        weeklyLogs.forEach(log => {
            log.days.forEach(day => {
                if (day.licensePlate && day.endMileage) {
                    const currentMax = mileageMap.get(day.licensePlate) || 0;
                    if (day.endMileage > currentMax) {
                        mileageMap.set(day.licensePlate, day.endMileage);
                    }
                }
            });
        });
        return mileageMap;
    }, [weeklyLogs]);

    const assignedUsersMap = useMemo(() => {
        const map = new Map<string, { uid: string, name: string }[]>();
        vehicles.forEach(vehicle => {
            const assigned = users
                .filter(user => user.assignedLicensePlates?.includes(vehicle.licensePlate))
                .map(user => ({ uid: user.uid!, name: `${user.firstName} ${user.lastName}` }));
            if (assigned.length > 0) {
                map.set(vehicle.id, assigned);
            }
        });
        return map;
    }, [vehicles, users]);

    const handleOpenDialog = (vehicle: Vehicle | null = null) => {
        setEditingVehicle(vehicle);
        const defaultStatus = statuses.find(s => s.isDefault)?.label || (statuses.length > 0 ? statuses[0].label : 'Actief');
        if (vehicle) {
            form.reset({
                ...vehicle,
                status: vehicle.status || defaultStatus,
                purchaseDate: vehicle.purchaseDate ? parseISO(vehicle.purchaseDate) : null,
            });
        } else {
             form.reset({
                licensePlate: '',
                make: '',
                model: '',
                status: defaultStatus,
                purchaseValue: 0,
                purchaseDate: null,
                monthlyLeaseAmount: 0,
                outstandingDepreciation: 0,
            });
        }
        setIsDialogOpen(true);
    };

    const onSubmit = async (data: VehicleFormData) => {
        const licensePlateUpper = data.licensePlate.toUpperCase();
        
        const dataToSave = {
            ...data,
            licensePlate: licensePlateUpper,
            purchaseDate: data.purchaseDate ? data.purchaseDate.toISOString() : null,
        }

        try {
            if (editingVehicle) {
                const payload = mapAppToSupabase({ ...dataToSave });
                const { error } = await supabase.from('vehicles').update(payload).eq('id', editingVehicle.id);
                if (error) throw error;
                toast({ title: 'Voertuig Bijgewerkt' });
            } else {
                const { data: dup } = await supabase.from('vehicles').select('id').eq('license_plate', licensePlateUpper).limit(1);
                if (dup && dup.length > 0) { toast({ variant: 'destructive', title: 'Kenteken bestaat al' }); return; }
                const payload = mapAppToSupabase({ ...dataToSave, createdAt: new Date().toISOString() });
                const { error } = await supabase.from('vehicles').insert(payload);
                if (error) throw error;
                toast({ title: 'Voertuig Toegevoegd' });
            }
            form.reset();
            setIsDialogOpen(false);
            setEditingVehicle(null);
        } catch (error) {
            console.error('Save vehicle error:', error);
            toast({ variant: 'destructive', title: 'Opslaan Mislukt' });
        }
    };
    
    const handleDeleteClick = (e: React.MouseEvent, vehicle: Vehicle) => {
        e.stopPropagation();
        const linkedUsers = users.filter(u => u.assignedLicensePlates?.includes(vehicle.licensePlate));
        const linkedCustomers = customers.filter(c => c.assignedLicensePlates?.includes(vehicle.licensePlate));

        if (linkedUsers.length > 0 || linkedCustomers.length > 0) {
            const userNames = linkedUsers.map(u => `${u.firstName} ${u.lastName}`).join(', ');
            const customerNames = linkedCustomers.map(c => c.companyName).join(', ');
            let description = 'Het kenteken is nog gekoppeld aan:';
            if (userNames) description += `\nMedewerkers: ${userNames}`;
            if (customerNames) description += `\nKlanten: ${customerNames}`;
            
            toast({
                variant: 'destructive',
                title: 'Verwijderen niet mogelijk',
                description: description,
                duration: 9000
            });
        } else {
            setVehicleToDelete(vehicle);
        }
    };
    
    const handleConfirmDelete = async () => {
        if (!vehicleToDelete) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase.from('vehicles').delete().eq('id', vehicleToDelete.id);
            if (error) throw error;
            toast({ title: `Voertuig ${vehicleToDelete.licensePlate} verwijderd.` });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Verwijderen mislukt' });
        } finally {
            setIsDeleting(false);
            setVehicleToDelete(null);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8">
             <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Wagenparkbeheer</h1>
                    <p className="text-muted-foreground">Voeg hier nieuwe voertuigen toe en beheer de details.</p>
                </div>
                <div className="flex items-center gap-2">
                     <Button variant="outline" onClick={() => router.push('/admin/fleet/statuses')}>
                        <Settings className="mr-2 h-4 w-4" />
                        Statusbeheer
                    </Button>
                    <Button onClick={() => handleOpenDialog()}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Nieuw Voertuig
                    </Button>
                </div>
            </div>
             <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingVehicle ? 'Voertuig Bewerken' : 'Nieuw Voertuig Toevoegen'}</DialogTitle>
                        <DialogDescription>
                            Voer de gegevens van het nieuwe voertuig in of pas een bestaand voertuig aan.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                             <FormField control={form.control} name="licensePlate" render={({ field }) => (
                                <FormItem><FormLabel>Kenteken</FormLabel><FormControl><Input placeholder="12-ABC-3" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="make" render={({ field }) => (
                                <FormItem><FormLabel>Merk</FormLabel><FormControl><Input placeholder="DAF" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="model" render={({ field }) => (
                                <FormItem><FormLabel>Model</FormLabel><FormControl><Input placeholder="XG" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="status" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Status</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecteer een status..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {statuses.map(opt => <SelectItem key={opt.id} value={opt.label}>{opt.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                             )} />
                             <FormField control={form.control} name="purchaseValue" render={({ field }) => (
                                <FormItem><FormLabel>Aanschafwaarde</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
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
                                        <Calendar mode="single" selected={field.value ? new Date(field.value) : undefined} onSelect={field.onChange} initialFocus />
                                    </PopoverContent></Popover><FormMessage />
                                </FormItem>
                            )} />
                             <FormField control={form.control} name="monthlyLeaseAmount" render={({ field }) => (
                                <FormItem><FormLabel>Maandelijks Leasebedrag</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="outstandingDepreciation" render={({ field }) => (
                                <FormItem><FormLabel>Openstaande Afschrijving</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="ghost" disabled={form.formState.isSubmitting}>Annuleren</Button></DialogClose>
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
                                <TableHead>Kenteken</TableHead>
                                <TableHead>Merk & Model</TableHead>
                                <TableHead>Gekoppelde Chauffeur(s)</TableHead>
                                <TableHead>Huidige Kilometerstand</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[100px] text-right">Acties</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                                        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                                        <TableCell><div className="flex justify-end gap-2"><Skeleton className="h-10 w-10" /><Skeleton className="h-10 w-10" /></div></TableCell>
                                    </TableRow>
                                ))
                            ) : vehicles.length > 0 ? (
                                vehicles.map(vehicle => {
                                    const statusLabel = vehicle.status?.toLowerCase() === 'active' ? 'Actief' : vehicle.status;
                                    return (
                                        <TableRow key={vehicle.id} onClick={() => router.push(`/admin/fleet/${vehicle.id}`)} className="cursor-pointer">
                                            <TableCell className="font-mono">{vehicle.licensePlate}</TableCell>
                                            <TableCell>{vehicle.make} {vehicle.model}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    {assignedUsersMap.get(vehicle.id)?.map(user => (
                                                         <Link key={user.uid} href={`/admin/users/${user.uid}`} onClick={e => e.stopPropagation()} className="text-primary hover:underline">
                                                            {user.name}
                                                        </Link>
                                                    )) || '-'}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {latestMileageMap.has(vehicle.licensePlate) 
                                                    ? `${latestMileageMap.get(vehicle.licensePlate)?.toLocaleString('nl-NL')} km`
                                                    : '-'
                                                }
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={statusLabel === 'Actief' ? 'success' : 'secondary'}>
                                                    {statusLabel}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleOpenDialog(vehicle); }}>
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                 <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={(e) => handleDeleteClick(e, vehicle)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24">
                                        Nog geen voertuigen toegevoegd.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

             <AlertDialog open={!!vehicleToDelete} onOpenChange={() => setVehicleToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deze actie kan niet ongedaan worden gemaakt. Dit zal het voertuig met kenteken <strong>{vehicleToDelete?.licensePlate}</strong> permanent verwijderen.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setVehicleToDelete(null)}>Annuleren</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Verwijderen'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
