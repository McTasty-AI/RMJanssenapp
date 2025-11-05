
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supplierSchema, type SupplierFormData } from '@/lib/schemas';
import type { Supplier } from '@/lib/types';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PlusCircle, Loader2, Edit, Trash2, UploadCloud, Bot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
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
import { supabase } from '@/lib/supabase/client';
import { mapAppToSupabase, mapSupabaseToApp } from '@/lib/utils';

const formatIban = (iban?: string): string => {
    if (!iban) return '-';
    const cleaned = iban.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return cleaned.replace(/(.{4})/g, '$1 ').trim();
};

export default function AdminSuppliersPage() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const form = useForm<SupplierFormData>({
        resolver: zodResolver(supplierSchema),
        defaultValues: {
            companyName: '',
            kvkNumber: '',
            vatNumber: '',
            street: '',
            houseNumber: '',
            postalCode: '',
            city: '',
            iban: '',
            contactName: '',
            contactEmail: '',
        }
    });

    const fetchSuppliers = useCallback(async () => {
        const { data, error } = await supabase
            .from('suppliers')
            .select('*')
            .order('company_name');

        if (error) {
            console.error('Error fetching suppliers:', error);
            toast({ variant: 'destructive', title: 'Fout bij ophalen leveranciers' });
            setLoading(false);
            return;
        }
        const mapped = (data || []).map(row => mapSupabaseToApp<Supplier>(row));
        setSuppliers(mapped);
        setLoading(false);
    }, [toast]);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        fetchSuppliers();

        const channel = supabase
            .channel('suppliers-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => {
                fetchSuppliers();
            })
            .subscribe();

        return () => {
            isMounted = false;
            channel.unsubscribe();
        };
    }, [toast, fetchSuppliers]);

    const handleOpenDialog = (supplier: Supplier | null = null) => {
        setEditingSupplier(supplier);
        if (supplier) {
            router.push(`/admin/suppliers/${supplier.id}`);
        } else {
            form.reset({
                companyName: '', kvkNumber: '', vatNumber: '', street: '', houseNumber: '', postalCode: '',
                city: '', iban: '', contactName: '', contactEmail: ''
            });
            setIsDialogOpen(true);
        }
    };
    
    const handleInvoiceAnalysis = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsAnalyzing(true);
        try {
           toast({ variant: 'destructive', title: 'Uploadfunctie Tijdelijk Uitgeschakeld' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Analyse mislukt', description: 'Kon de gegevens niet uitlezen.' });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const onSubmit = async (data: SupplierFormData) => {
        try {
            // Validate duplicates
            if (data.kvkNumber) {
                const { data: dup, error: dupErr } = await supabase
                    .from('suppliers')
                    .select('id')
                    .eq('kvk_number', data.kvkNumber)
                    .limit(1);
                if (dupErr) throw dupErr;
                if (dup && dup.length > 0) {
                    toast({ variant: 'destructive', title: 'KVK-nummer bestaat al' });
                    return;
                }
            } else {
                const { data: dupName, error: dupNameErr } = await supabase
                    .from('suppliers')
                    .select('id')
                    .eq('company_name', data.companyName)
                    .limit(1);
                if (dupNameErr) throw dupNameErr;
                if (dupName && dupName.length > 0) {
                    toast({ variant: 'destructive', title: 'Bedrijfsnaam bestaat al' });
                    return;
                }
            }

            const payload = mapAppToSupabase({
                ...data,
                createdAt: new Date().toISOString(),
            });
            const { error } = await supabase.from('suppliers').insert(payload);
            if (error) throw error;

            toast({ title: 'Leverancier Opgeslagen' });
            form.reset();
            setIsDialogOpen(false);
            setEditingSupplier(null);
            // Refresh suppliers immediately
            await fetchSuppliers();
        } catch (error) {
            console.error('Error saving supplier:', error);
            toast({ variant: 'destructive', title: 'Opslaan Mislukt' });
        }
    };
    
     const handleDeleteSupplier = async () => {
        if (!supplierToDelete) return;
        setIsDeleting(true);
        try {
            // First check if there are any invoices linked to this supplier
            const { data: invoices, error: checkError } = await supabase
                .from('purchase_invoices')
                .select('id')
                .eq('supplier_id', supplierToDelete.id)
                .limit(1);
            
            if (checkError) {
                console.error('Error checking invoices:', checkError);
            }
            
            if (invoices && invoices.length > 0) {
                toast({ 
                    variant: 'destructive', 
                    title: 'Verwijderen niet mogelijk', 
                    description: 'Deze leverancier kan niet worden verwijderd omdat er nog facturen aan gekoppeld zijn. Verwijder eerst de gekoppelde facturen.' 
                });
                setIsDeleting(false);
                setIsDeleteAlertOpen(false);
                setSupplierToDelete(null);
                return;
            }
            
            const { error } = await supabase
                .from('suppliers')
                .delete()
                .eq('id', supplierToDelete.id);
                
            if (error) {
                // Check if error is due to foreign key constraint
                if (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('violates foreign key')) {
                    toast({ 
                        variant: 'destructive', 
                        title: 'Verwijderen niet mogelijk', 
                        description: 'Deze leverancier kan niet worden verwijderd omdat er nog facturen aan gekoppeld zijn.' 
                    });
                } else {
                    throw error;
                }
                return;
            }
            toast({ title: 'Leverancier verwijderd' });
            setIsDeleteAlertOpen(false);
            setSupplierToDelete(null);
            // Refresh suppliers immediately
            await fetchSuppliers();
        } catch (error: any) {
            console.error('Error deleting supplier:', error);
            const errorMessage = error?.message || error?.code || 'Onbekende fout';
            toast({ 
                variant: 'destructive', 
                title: 'Verwijderen mislukt',
                description: typeof errorMessage === 'string' ? errorMessage : 'Er is een fout opgetreden bij het verwijderen van de leverancier.'
            });
        } finally {
            setIsDeleting(false);
            setIsDeleteAlertOpen(false);
            setSupplierToDelete(null);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8">
             <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Leveranciersbeheer</h1>
                    <p className="text-muted-foreground">Voeg hier nieuwe leveranciers toe en beheer bestaande gegevens.</p>
                </div>
                <Button onClick={() => handleOpenDialog()}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nieuwe Leverancier
                </Button>
            </div>
             <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Nieuwe Leverancier Toevoegen</DialogTitle>
                        <DialogDescription>
                            Voer de gegevens van de leverancier in, of upload een factuur om de gegevens automatisch te laten vullen.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <div className="p-4 border-dashed border-2 rounded-md text-center">
                                 <Button type="button" variant="ghost" asChild disabled>
                                    <label className="cursor-pointer">
                                        <Bot className="mr-2 h-4 w-4" />
                                        Vul met AI (Upload is tijdelijk uitgeschakeld)
                                        <input type="file" className="sr-only" onChange={handleInvoiceAnalysis} accept="image/*,.pdf" disabled/>
                                    </label>
                                </Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="companyName" render={({ field }) => (
                                    <FormItem><FormLabel>Bedrijfsnaam</FormLabel><FormControl><Input placeholder="Leverancier B.V." {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="contactName" render={({ field }) => (
                                    <FormItem><FormLabel>Naam contactpersoon</FormLabel><FormControl><Input placeholder="Jan Jansen" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="kvkNumber" render={({ field }) => (
                                    <FormItem><FormLabel>KVK-nummer</FormLabel><FormControl><Input placeholder="12345678" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )} />
                                 <FormField control={form.control} name="vatNumber" render={({ field }) => (
                                    <FormItem><FormLabel>BTW-nummer</FormLabel><FormControl><Input placeholder="NL123456789B01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )}/>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                                <FormField control={form.control} name="street" render={({ field }) => (
                                    <FormItem><FormLabel>Straat</FormLabel><FormControl><Input placeholder="Voorbeeldstraat" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="houseNumber" render={({ field }) => (
                                    <FormItem><FormLabel>Huisnummer</FormLabel><FormControl><Input placeholder="123" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )}/>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="postalCode" render={({ field }) => (
                                    <FormItem><FormLabel>Postcode</FormLabel><FormControl><Input placeholder="1234 AB" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                 <FormField control={form.control} name="city" render={({ field }) => (
                                    <FormItem><FormLabel>Stad</FormLabel><FormControl><Input placeholder="Amsterdam" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )}/>
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="iban" render={({ field }) => (
                                    <FormItem><FormLabel>IBAN</FormLabel><FormControl><Input placeholder="NL..." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="contactEmail" render={({ field }) => (
                                    <FormItem><FormLabel>Email contactpersoon</FormLabel><FormControl><Input placeholder="j.jansen@voorbeeld.nl" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                )} />
                             </div>
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
                                <TableHead>Bedrijfsnaam</TableHead>
                                <TableHead>Contactpersoon</TableHead>
                                <TableHead>KVK</TableHead>
                                <TableHead>IBAN</TableHead>
                                <TableHead className="w-[100px] text-right">Acties</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                        <TableCell><Skeleton className="h-10 w-24 ml-auto" /></TableCell>
                                    </TableRow>
                                ))
                            ) : suppliers.length > 0 ? (
                                suppliers.map(supplier => (
                                    <TableRow key={supplier.id} onClick={() => handleOpenDialog(supplier)} className="cursor-pointer">
                                        <TableCell className="font-medium">{supplier.companyName}</TableCell>
                                        <TableCell>
                                            {supplier.contactName ? (
                                                <div>
                                                    <p>{supplier.contactName}</p>
                                                    <a href={`mailto:${supplier.contactEmail}`} className="text-sm text-muted-foreground hover:text-primary">{supplier.contactEmail}</a>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>{supplier.kvkNumber || '-'}</TableCell>
                                        <TableCell className="font-mono">{formatIban(supplier.iban)}</TableCell>
                                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(supplier)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => { setSupplierToDelete(supplier); setIsDeleteAlertOpen(true); }}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24">
                                        Nog geen leveranciers toegevoegd.
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
                        Deze actie kan niet ongedaan worden gemaakt. Dit zal de leverancier <strong>{supplierToDelete?.companyName}</strong> permanent verwijderen.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setSupplierToDelete(null)}>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteSupplier} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isDeleting ? 'Verwijderen...' : 'Verwijderen'}
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
