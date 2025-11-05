
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Supplier } from '@/lib/types';
import { supplierSchema, type SupplierFormData } from '@/lib/schemas';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Save, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { mapAppToSupabase, mapSupabaseToApp } from '@/lib/utils';

export default function SupplierDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const supplierId = params.id as string;
    const [supplier, setSupplier] = useState<Supplier | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

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
        },
    });

    useEffect(() => {
        if (!supplierId) return;
        let isMounted = true;
        setLoading(true);
        supabase
            .from('suppliers')
            .select('*')
            .eq('id', supplierId)
            .single()
            .then(({ data, error }) => {
                if (!isMounted) return;
                if (error || !data) {
                    console.error(error);
                    toast({ variant: 'destructive', title: 'Leverancier niet gevonden' });
                    router.push('/admin/suppliers');
                    return;
                }
                const base = mapSupabaseToApp(data) as any;
                const mapped = { ...base, id: data.id } as Supplier;
                setSupplier(mapped);
                form.reset(mapped);
            })
            .then(() => {
                if (isMounted) setLoading(false);
            });
        return () => { isMounted = false; };
    }, [supplierId, form, router, toast]);

    const onSubmit = async (data: SupplierFormData) => {
        try {
            const payload = mapAppToSupabase(data);
            const { error } = await supabase
                .from('suppliers')
                .update(payload)
                .eq('id', supplierId);
            if (error) throw error;
            toast({ title: 'Leverancier bijgewerkt', description: 'De gegevens zijn succesvol opgeslagen.' });
            form.reset(data, { keepDirty: false });
        } catch (error) {
            console.error('Error updating supplier:', error);
            toast({ variant: 'destructive', title: 'Opslaan Mislukt' });
        }
    };

    if (loading) {
        return (
            <div className="space-y-8">
                <Skeleton className="h-8 w-48 mb-4" />
                <Skeleton className="h-[500px] w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <Button variant="ghost" onClick={() => router.push('/admin/suppliers')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Terug naar overzicht
            </Button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Leverancierdossier: {supplier?.companyName}</h1>
                    <p className="text-muted-foreground">Beheer hier de gegevens van de leverancier.</p>
                </div>
            </div>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Leveranciersdossier: {supplier?.companyName}</CardTitle>
                            <CardDescription>Beheer hier de gegevens van de leverancier.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                        </CardContent>
                        <CardFooter className="flex justify-end">
                            <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
                                {form.formState.isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                                Wijzigingen Opslaan
                            </Button>
                        </CardFooter>
                    </Card>
                </form>
            </Form>
        </div>
    );
}
