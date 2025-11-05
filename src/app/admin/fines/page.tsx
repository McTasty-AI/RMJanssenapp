
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { fineSchema, type FineFormData } from '@/lib/schemas';
import type { Fine, User, FinePaidBy, WeeklyLog, DailyLog, Vehicle } from '@/lib/types';
import { finePaidByTranslations, finePaidByOptions } from '@/lib/types';
import { useAdminData } from '@/hooks/use-admin-data';
import { supabase } from '@/lib/supabase/client';
import { format, getYear, parseISO, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import Image from 'next/image';
import { analyzeFine, type AnalyzeFineOutput } from '@/ai/flows/analyze-fine-flow';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Loader2, PlusCircle, Building, User as UserIcon, UploadCloud, Truck, FileCheck, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';

const FineBadge = ({ paidBy }: { paidBy: FinePaidBy }) => {
    const variant = paidBy === 'company' ? 'secondary' : 'destructive';
    const icon = paidBy === 'company' ? <Building className="mr-1 h-3 w-3" /> : <UserIcon className="mr-1 h-3 w-3" />;
    return (
        <Badge variant={variant} className="flex items-center w-fit">
            {icon}
            {finePaidByTranslations[paidBy]}
        </Badge>
    );
};

const formatLicensePlate = (plate?: string): string | undefined => {
    if (!plate) return undefined;
    const cleaned = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    // Dutch Sidecode formats: https://nl.wikipedia.org/wiki/Nederlands_kenteken#Alle_sidecodes
    const sidecodes = [
        /^([A-Z]{2})(\d{2})(\d{2})$/, // 1: XX-99-99
        /^(\d{2})(\d{2})([A-Z]{2})$/, // 2: 99-99-XX
        /^(\d{2})([A-Z]{2})(\d{2})$/, // 3: 99-XX-99
        /^([A-Z]{2})(\d{2})([A-Z]{2})$/, // 4: XX-99-XX
        /^([A-Z]{2})([A-Z]{2})(\d{2})$/, // 5: XX-XX-99
        /^(\d{2})([A-Z]{2})([A-Z]{2})$/, // 6: 99-XX-XX
        /^(\d{2})([A-Z]{3})(\d{1})$/, // 7: 99-XXX-9
        /^(\d{1})([A-Z]{3})(\d{2})$/, // 8: 9-XXX-99
        /^([A-Z]{2})(\d{3})([A-Z]{1})$/, // 9: XX-999-X
        /^([A-Z]{1})(\d{3})([A-Z]{2})$/, // 10: X-999-XX
        /^([A-Z]{3})(\d{2})([A-Z]{1})$/, // 11: XXX-99-X
        /^([A-Z]{1})(\d{2})([A-Z]{3})$/, // 12: X-99-XXX
        /^(\d{1})([A-Z]{2})(\d{3})$/, // 13: 9-XX-999
        /^(\d{3})([A-Z]{2})(\d{1})$/, // 14: 999-XX-9
    ];

    for (const regex of sidecodes) {
        const match = cleaned.match(regex);
        if (match) {
            return `${match[1]}-${match[2]}-${match[3]}`;
        }
    }
    
    // Fallback for foreign plates or unrecognized formats
    return plate;
};

export default function AdminFinesPage() {
    const { users, vehicles: allVehicles, logs: allLogs, loading: usersLoading } = useAdminData();
    const [fines, setFines] = useState<Fine[]>([]);
    const [loadingFines, setLoadingFines] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [fineToDelete, setFineToDelete] = useState<Fine | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isAlertOpen, setIsAlertOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const { authUser } = useAuth();


    const form = useForm<FineFormData>({
        resolver: zodResolver(fineSchema),
        defaultValues: {
            userId: '',
            date: new Date(),
            amount: 0,
            reason: '',
            paidBy: undefined,
            receipt: undefined,
            licensePlate: undefined,
        },
    });

    const vehicles = allVehicles.filter(v => v.status !== 'Inactief' && v.status !== 'Verkocht');
    
    const findUserByLog = (date: Date, plate: string): string | null => {
        for (const log of allLogs) {
            const day = log.days.find(d => {
                if (!d.licensePlate || d.licensePlate !== plate) return false;
                try {
                    return isSameDay(parseISO(d.date), date);
                } catch {
                    return false;
                }
            });
            if (day) {
                return log.userId;
            }
        }
        return null;
    };
    
    /**
     * Find user by date, time, and license plate
     * Checks if the violation time falls within the driver's work hours for that day
     */
    const findUserByLogWithTime = (date: Date, time: string | undefined, plate: string): string | null => {
        if (!plate || !time) {
            // Fallback to date-only match if time is not available
            return findUserByLog(date, plate);
        }
        
        // Parse violation time (HH:mm format)
        const timeParts = time.split(':');
        if (timeParts.length < 2) {
            return findUserByLog(date, plate);
        }
        
        const violationHour = parseInt(timeParts[0], 10);
        const violationMinute = parseInt(timeParts[1], 10);
        
        if (isNaN(violationHour) || isNaN(violationMinute)) {
            return findUserByLog(date, plate);
        }
        
        const violationTotalMinutes = violationHour * 60 + violationMinute;
        
        // Search through all logs
        for (const log of allLogs) {
            const day = log.days.find(d => {
                // Check date and license plate match
                if (!d.licensePlate || d.licensePlate !== plate) return false;
                if (d.status !== 'gewerkt') return false; // Only match worked days
                
                try {
                    if (!isSameDay(parseISO(d.date), date)) return false;
                } catch {
                    return false;
                }
                
                // Check if violation time falls within work hours
                const startTotalMinutes = (d.startTime?.hour || 0) * 60 + (d.startTime?.minute || 0);
                const endTotalMinutes = (d.endTime?.hour || 0) * 60 + (d.endTime?.minute || 0);
                
                // If no work hours recorded, still match (fallback)
                if (startTotalMinutes === 0 && endTotalMinutes === 0) {
                    return true;
                }
                
                // Check if violation time is within work hours
                return violationTotalMinutes >= startTotalMinutes && violationTotalMinutes <= endTotalMinutes;
            });
            
            if (day) {
                return log.userId;
            }
        }
        
        return null;
    };
    
    const checkForDuplicateFine = async (data: {
        licensePlate?: string;
        amount: number;
        date: Date;
    }): Promise<boolean> => {
        if (!data.licensePlate) return false;
        
        const { data: rows, error } = await supabase
          .from('fines')
          .select('date')
          .eq('license_plate', data.licensePlate)
          .eq('amount', data.amount);
        if (error) { console.error('Error checking existing fine:', error); return false; }
        if (!rows || rows.length === 0) return false;
        return rows.some(r => isSameDay(parseISO(r.date), data.date));
    }

    useEffect(() => {
        let active = true;
        const fetchFines = async () => {
            const { data, error } = await supabase
              .from('fines')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(50);
            if (!active) return;
            if (error) {
                console.error("Error fetching fines:", error);
                toast({ variant: 'destructive', title: "Fout bij ophalen boetes" });
                setLoadingFines(false);
                return;
            }
            
            // Generate signed URLs for receipts (fines bucket is private)
            const mapped = await Promise.all((data || []).map(async (r) => {
                let receiptUrl: string | undefined = undefined;
                if (r.receipt_path) {
                    const { data: signedUrlData } = await supabase.storage
                        .from('fines')
                        .createSignedUrl(r.receipt_path, 3600); // 1 hour expiry
                    receiptUrl = signedUrlData?.signedUrl;
                }
                
                return {
                    id: r.id,
                    userId: r.user_id || '',
                    userFirstName: '',
                    userLastName: '',
                    date: r.date ? new Date(r.date).toISOString() : new Date().toISOString(),
                    amount: Number(r.amount) || 0,
                    reason: r.reason || '',
                    paidBy: r.paid_by || 'company',
                    receiptUrl,
                    licensePlate: r.license_plate || undefined,
                    createdAt: r.created_at || new Date().toISOString(),
                } as Fine;
            }));
            
            setFines(mapped);
            setLoadingFines(false);
        };
        fetchFines();
        const ch = supabase.channel('admin-fines').on('postgres_changes', { event: '*', schema: 'public', table: 'fines' }, fetchFines).subscribe();
        return () => { active = false; ch.unsubscribe(); };
    }, [toast]);
    
     const getCompanyPaidFinesInfo = async (userId: string, fineDate: Date) => {
        const year = getYear(fineDate);
        const { data, error } = await supabase
          .from('fines')
          .select('*')
          .eq('user_id', userId);
        if (error) { console.error('Error fetching fines for user:', error); return { count: 0, totalAmount: 0 }; }
        const yearlyFines = (data || []).map(r => ({
            date: r.date,
            amount: Number(r.amount) || 0,
            paidBy: r.paid_by || 'company',
        })) as Pick<Fine, 'date' | 'amount' | 'paidBy'>[];
        const filtered = yearlyFines.filter(f => getYear(new Date(f.date)) === year);
        const companyPaidFines = filtered.filter(f => f.paidBy === 'company');
        return {
            count: filtered.length,
            totalAmount: companyPaidFines.reduce((sum, fine) => sum + fine.amount, 0),
        };
    };

    // Fill fine user names once users list is available
    useEffect(() => {
        if (!users || users.length === 0 || fines.length === 0) return;
        const map = new Map(users.map(u => [u.uid, `${u.firstName} ${u.lastName}`]));
        setFines(prev => prev.map(f => ({
            ...f,
            userFirstName: f.userFirstName || (map.get(f.userId)?.split(' ')[0] || ''),
            userLastName: f.userLastName || (map.get(f.userId)?.split(' ').slice(1).join(' ') || ''),
        })) as Fine[]);
    }, [users, fines.length]);

    const handleUserChange = async (userId: string) => {
        form.setValue('userId', userId);
        const selectedUser = users.find(u => u.uid === userId);
        if (!selectedUser) return;

        const fineDate = form.getValues('date');
        const { count, totalAmount } = await getCompanyPaidFinesInfo(userId, fineDate);

        toast({
            title: `Info: ${selectedUser.firstName} ${selectedUser.lastName}`,
            description: `Heeft dit jaar al ${count} boete(s) gehad. Het bedrijf hiervan €${totalAmount.toFixed(2)} betaald.`,
            duration: 9000
        });
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsAnalyzing(true);
        form.setValue('receipt', event.target.files);

        try {
            // Convert file to data URI for AI analysis
            const reader = new FileReader();
            reader.onload = async (e) => {
                if (!e.target?.result) return;
                const dataUri = e.target.result as string;

                try {
                    const result = await analyzeFine({ photoDataUri: dataUri });
                    
                    // Auto-fill form fields based on AI analysis
                    let parsedDate: Date | undefined;
                    if (result.date) {
                        parsedDate = new Date(result.date);
                        if (!isNaN(parsedDate.getTime())) {
                            form.setValue('date', parsedDate);
                        }
                    }
                    if (result.amount) {
                        form.setValue('amount', result.amount);
                    }
                    if (result.reason) {
                        form.setValue('reason', result.reason);
                    }
                    
                    let formattedPlate: string | undefined;
                    if (result.licensePlate) {
                        formattedPlate = formatLicensePlate(result.licensePlate);
                        if (formattedPlate && vehicles.some(v => v.licensePlate === formattedPlate)) {
                            form.setValue('licensePlate', formattedPlate);
                        }
                    }

                    // Try to match driver based on date, time, and license plate
                    if (parsedDate && formattedPlate && result.time) {
                        const matchedUserId = findUserByLogWithTime(parsedDate, result.time, formattedPlate);
                        
                        if (matchedUserId) {
                            // Driver found, auto-fill
                            form.setValue('userId', matchedUserId);
                            const matchedUser = users.find(u => u.uid === matchedUserId);
                            toast({
                                title: 'Boete Geanalyseerd',
                                description: `De boete is succesvol geanalyseerd. Chauffeur automatisch ingevuld: ${matchedUser ? `${matchedUser.firstName} ${matchedUser.lastName}` : 'Onbekend'}.`,
                            });
                        } else {
                            // No driver match found
                            toast({
                                variant: 'destructive',
                                title: 'Boete Geanalyseerd - Geen Match',
                                description: `De boete is geanalyseerd, maar er is geen chauffeur gevonden die op ${format(parsedDate, 'dd-MM-yyyy')} om ${result.time} uur met kenteken ${formattedPlate} heeft gewerkt. Selecteer handmatig een chauffeur.`,
                                duration: 10000,
                            });
                        }
                    } else {
                        // Date, time, or plate missing - no driver matching possible
                        toast({
                            title: 'Boete Geanalyseerd',
                            description: 'De boete is succesvol geanalyseerd. Controleer de ingevulde gegevens en selecteer handmatig een chauffeur.',
                        });
                    }
                } catch (error) {
                    console.error('Error analyzing fine:', error);
                    toast({
                        variant: 'destructive',
                        title: 'Analyse Mislukt',
                        description: 'De boete kon niet automatisch worden geanalyseerd. Vul de gegevens handmatig in.',
                    });
                } finally {
                    setIsAnalyzing(false);
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Error reading file:', error);
            setIsAnalyzing(false);
            toast({
                variant: 'destructive',
                title: 'Bestand Lezen Mislukt',
                description: 'Er is een fout opgetreden bij het lezen van het bestand.',
            });
        }
    };

    const onSubmit = async (data: FineFormData) => {
        setIsSubmitting(true);
        try {
            if (!authUser) {
                toast({ variant: 'destructive', title: 'Niet ingelogd' });
                return;
            }

            // Check for duplicate fines
            const isDuplicate = await checkForDuplicateFine({
                licensePlate: data.licensePlate,
                amount: data.amount,
                date: data.date,
            });

            if (isDuplicate) {
                toast({
                    variant: 'destructive',
                    title: 'Dubbele Boete',
                    description: 'Er bestaat al een boete met hetzelfde bedrag en kenteken op deze datum.',
                });
                return;
            }

            let receiptPath: string | undefined = undefined;

            // Upload file if provided
            if (data.receipt && data.receipt.length > 0) {
                const file = data.receipt[0];
                const year = format(data.date, 'yyyy');
                const month = format(data.date, 'MM');
                const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
                const objectPath = `${year}/${month}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('fines')
                    .upload(objectPath, file, { contentType: file.type, upsert: false });

                if (uploadError) {
                    throw new Error(`Upload mislukt: ${uploadError.message}`);
                }

                receiptPath = objectPath;
            }

            // Insert fine into database
            const { error: insertError } = await supabase.from('fines').insert({
                user_id: data.userId || null,
                license_plate: data.licensePlate || null,
                date: format(data.date, 'yyyy-MM-dd'),
                amount: data.amount,
                reason: data.reason,
                paid_by: data.paidBy,
                receipt_path: receiptPath || null,
            });

            if (insertError) throw insertError;

            toast({
                title: 'Boete Opgeslagen',
                description: 'De boete is succesvol opgeslagen.',
            });

            // Reset form and close dialog
            form.reset({
                userId: '',
                date: new Date(),
                amount: 0,
                reason: '',
                paidBy: undefined,
                receipt: undefined,
                licensePlate: undefined,
            });
            setIsDialogOpen(false);

            // Refresh fines list
            const { data: finesData, error: fetchError } = await supabase
                .from('fines')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);
            
            if (!fetchError && finesData) {
                // Generate signed URLs for receipts (fines bucket is private)
                const mapped = await Promise.all(finesData.map(async (r) => {
                    let receiptUrl: string | undefined = undefined;
                    if (r.receipt_path) {
                        const { data: signedUrlData } = await supabase.storage
                            .from('fines')
                            .createSignedUrl(r.receipt_path, 3600); // 1 hour expiry
                        receiptUrl = signedUrlData?.signedUrl;
                    }
                    
                    return {
                        id: r.id,
                        userId: r.user_id || '',
                        userFirstName: '',
                        userLastName: '',
                        date: r.date ? new Date(r.date).toISOString() : new Date().toISOString(),
                        amount: Number(r.amount) || 0,
                        reason: r.reason || '',
                        paidBy: r.paid_by || 'company',
                        receiptUrl,
                        licensePlate: r.license_plate || undefined,
                        createdAt: r.created_at || new Date().toISOString(),
                    } as Fine;
                }));
                setFines(mapped);
            }
        } catch (error: any) {
            console.error('Error saving fine:', error);
            toast({
                variant: 'destructive',
                title: 'Opslaan Mislukt',
                description: `Er is een fout opgetreden: ${error.message || 'Onbekende fout'}`,
                duration: 9000,
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteFine = async () => {
        if (!fineToDelete) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase.from('fines').delete().eq('id', fineToDelete.id);
            if (error) throw error;
            toast({
                title: "Boete verwijderd",
                description: "De boete is succesvol verwijderd.",
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Verwijderen mislukt',
                description: 'Er is een fout opgetreden bij het verwijderen van de boete.',
            });
        } finally {
            setIsDeleting(false);
            setIsAlertOpen(false);
            setFineToDelete(null);
        }
    };

    const loading = usersLoading || loadingFines;

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Boetebeheer</h1>
                    <p className="text-muted-foreground">Voeg hier nieuwe boetes voor chauffeurs toe en bekijk de historie.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                     <DialogTrigger asChild>
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Nieuwe Boete
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Nieuwe Boete Toevoegen</DialogTitle>
                            <DialogDescription>
                                Upload een foto of PDF van de boete om automatisch de gegevens te laten invullen.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex-grow overflow-y-auto -mx-6 px-6">
                            <Form {...form}>
                                <form id="fine-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    <FormField
                                    control={form.control}
                                    name="receipt"
                                    render={({ field: { onChange, value, ...rest } }) => (
                                        <FormItem>
                                        <FormLabel>Foto of PDF van Boete</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                            <Input
                                                type="file"
                                                accept="image/*,.pdf"
                                                className="pl-12"
                                                onChange={(e) => {
                                                    onChange(e.target.files);
                                                    handleFileChange(e);
                                                }}
                                                disabled={isAnalyzing}
                                                {...rest}
                                            />
                                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                                {isAnalyzing ? (
                                                    <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                                                ) : (
                                                    <UploadCloud className="h-5 w-5 text-gray-400" />
                                                )}
                                            </div>
                                            </div>
                                        </FormControl>
                                        {isAnalyzing && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                <FileCheck className="h-3 w-3" />
                                                Boete wordt geanalyseerd...
                                            </p>
                                        )}
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                    />
                                    
                                    <FormField
                                        control={form.control}
                                        name="userId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Chauffeur</FormLabel>
                                                <Select onValueChange={handleUserChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger disabled={usersLoading}>
                                                            <SelectValue placeholder="Selecteer een chauffeur..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {users.map(user => (
                                                            <SelectItem key={user.uid} value={user.uid!}>{user.firstName} {user.lastName}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="licensePlate"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Kenteken</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <Truck className="mr-2 h-4 w-4 opacity-50" />
                                                            <SelectValue placeholder="Selecteer een kenteken..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {vehicles.map(v => (
                                                            <SelectItem key={v.id} value={v.licensePlate}>{v.licensePlate}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="date"
                                        render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel>Datum van overtreding</FormLabel>
                                            <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                    {field.value ? format(field.value, 'PPP', { locale: nl }) : <span>Kies een datum</span>}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date()} initialFocus />
                                            </PopoverContent>
                                            </Popover>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="amount"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Bedrag (€)</FormLabel>
                                            <FormControl>
                                            <Input type="number" step="0.01" placeholder="99.00" {...field} onChange={e => field.onChange(Number(e.target.value))}/>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="reason"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Reden / Overtreding</FormLabel>
                                            <FormControl>
                                            <Textarea placeholder="Bijv. snelheidsovertreding, door rood licht, etc." {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="paidBy"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Betaald door</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Selecteer wie betaalt..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {finePaidByOptions.map(option => (
                                                            <SelectItem key={option} value={option}>{finePaidByTranslations[option]}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </form>
                            </Form>
                        </div>
                        <DialogFooter className="flex-shrink-0 pt-4">
                            <DialogClose asChild>
                                <Button type="button" variant="secondary" disabled={isSubmitting}>Annuleren</Button>
                            </DialogClose>
                            <Button type="submit" form="fine-form" disabled={isSubmitting || isAnalyzing}>
                                {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <PlusCircle className="mr-2 h-4 w-4" />}
                                Toevoegen
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Boetehistorie</CardTitle>
                    <CardDescription>Overzicht van alle geregistreerde boetes.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Datum</TableHead>
                                <TableHead>Chauffeur</TableHead>
                                <TableHead>Kenteken</TableHead>
                                <TableHead>Reden</TableHead>
                                <TableHead>Bedrag</TableHead>
                                <TableHead>Betaald door</TableHead>
                                <TableHead>Boete</TableHead>
                                <TableHead className="w-[100px] text-right">Acties</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                                    <TableCell className="text-right"><Skeleton className="h-8 w-10 ml-auto" /></TableCell>
                                </TableRow>
                                ))
                            ) : fines.length > 0 ? (
                                fines.map(fine => (
                                <TableRow key={fine.id}>
                                    <TableCell>{format(new Date(fine.date), 'dd-MM-yyyy')}</TableCell>
                                    <TableCell>{fine.userFirstName} {fine.userLastName}</TableCell>
                                    <TableCell>{fine.licensePlate || '-'}</TableCell>
                                    <TableCell>{fine.reason}</TableCell>
                                    <TableCell>€{fine.amount.toFixed(2)}</TableCell>
                                    <TableCell><FineBadge paidBy={fine.paidBy} /></TableCell>
                                    <TableCell>
                                        {fine.receiptUrl && (
                                            <Button variant="outline" size="sm" asChild>
                                                <a href={fine.receiptUrl} target="_blank" rel="noopener noreferrer">Bekijk</a>
                                            </Button>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                setFineToDelete(fine);
                                                setIsAlertOpen(true);
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center h-24">
                                        Er zijn nog geen boetes geregistreerd.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Deze actie kan niet ongedaan worden gemaakt. Dit zal de boete permanent verwijderen.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setFineToDelete(null)}>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteFine} disabled={isDeleting}>
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isDeleting ? 'Verwijderen...' : 'Verwijderen'}
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
