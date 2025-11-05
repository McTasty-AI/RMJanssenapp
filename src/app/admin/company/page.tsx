
"use client";

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { companyProfileSchema, type CompanyProfileFormData } from '@/lib/schemas';
import { supabase } from '@/lib/supabase/client';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, UploadCloud, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import DebugConsole from '@/components/DebugConsole';

export default function AdminCompanyPage() {
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const form = useForm<CompanyProfileFormData>({
        resolver: zodResolver(companyProfileSchema),
        defaultValues: {
            companyName: '',
            street: '',
            houseNumber: '',
            postalCode: '',
            city: '',
            email: '',
            phone: '',
            kvkNumber: '',
            vatNumber: '',
            iban: '',
            logoUrl: '',
        },
    });

    useEffect(() => {
        const fetchProfile = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('company_profile')
                    .select('*')
                    .eq('id', 'main')
                    .maybeSingle();
                if (error) throw error;
                if (data) {
                    form.reset({
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
            } catch (error) {
                console.error('Error fetching company profile:', error);
                toast({ variant: 'destructive', title: 'Fout bij ophalen profiel' });
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount
    
    const onSubmit = async (data: CompanyProfileFormData) => {
        setIsSubmitting(true);
        try {
            const payload = {
                id: 'main',
                company_name: data.companyName,
                street: data.street,
                house_number: data.houseNumber,
                postal_code: data.postalCode,
                city: data.city,
                email: data.email,
                phone: data.phone,
                kvk_number: data.kvkNumber,
                vat_number: data.vatNumber,
                iban: data.iban,
                logo_url: data.logoUrl,
            };
            const { error } = await supabase
                .from('company_profile')
                .upsert(payload, { onConflict: 'id' });
            if (error) throw error;

            toast({ title: 'Bedrijfsgegevens Opgeslagen', description: 'De bedrijfsgegevens zijn bijgewerkt.' });
            form.reset(data, { keepDirty: false });
        } catch (error) {
            console.error('[onSubmit] error:', error);
            toast({ variant: 'destructive', title: 'Opslaan Mislukt', description: 'Er is een onverwachte fout opgetreden bij het opslaan van de gegevens.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', 'company_assets/logo');

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || errorData.error || 'Upload mislukt');
            }
            
            const responseData = await response.json();
            form.setValue('logoUrl', responseData.url, { shouldDirty: true });
            toast({ title: "Logo succesvol geüpload" });
        } catch (error: any) {
             toast({ 
                variant: 'destructive', 
                title: "Upload mislukt", 
                description: error.message,
                duration: 9000,
            });
        } finally {
            setIsUploading(false);
            // Reset file input to allow re-uploading the same file
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };
    
     const handleDeleteLogo = async () => {
        const logoUrl = form.getValues('logoUrl');
        if (!logoUrl) return;

        setIsUploading(true); // Reuse uploading state for deletion
        try {
            const response = await fetch('/api/upload', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: logoUrl }),
            });

            if (!response.ok) throw new Error('Verwijderen mislukt');

            form.setValue('logoUrl', '', { shouldDirty: true });
            toast({ title: 'Logo verwijderd' });
        } catch (error) {
             toast({ variant: 'destructive', title: 'Verwijderen mislukt' });
        } finally {
            setIsUploading(false);
        }
    };

    const logoUrl = form.watch('logoUrl');

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Bedrijfsprofiel</h1>
                    <p className="text-muted-foreground">Beheer hier de algemene bedrijfsgegevens die op facturen en andere documenten worden gebruikt.</p>
                </div>
            </div>
            <div className="max-w-4xl mx-auto">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <Card>
                            <CardHeader>
                                <CardTitle>Bedrijfsgegevens</CardTitle>
                                <CardDescription>
                                    Vul hier alle bedrijfsgegevens in.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {loading ? (
                                    <div className="space-y-4">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-24 w-full" />
                                    </div>
                                ) : (
                                    <>
                                        <FormField
                                            control={form.control}
                                            name="logoUrl"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Bedrijfslogo</FormLabel>
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-24 h-24 bg-muted rounded-md flex items-center justify-center overflow-hidden">
                                                        {logoUrl ? (
                                                            <Image src={logoUrl} alt="Logo" width={96} height={96} className="object-contain" unoptimized />
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">Geen logo</span>
                                                        )}
                                                        </div>
                                                        <div className="flex flex-col gap-2">
                                                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/png, image/jpeg, image/webp, image/svg+xml" />
                                                            <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                                                                {isUploading ? <Loader2 className="animate-spin mr-2"/> : <UploadCloud className="mr-2 h-4 w-4" />}
                                                                {logoUrl ? 'Logo Wijzigen' : 'Logo Uploaden'}
                                                            </Button>
                                                            {logoUrl && (
                                                                <Button type="button" variant="destructive" size="sm" onClick={handleDeleteLogo} disabled={isUploading}>
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Verwijderen
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                     <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormField control={form.control} name="companyName" render={({ field }) => (
                                                <FormItem><FormLabel>Bedrijfsnaam</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                                            <FormField control={form.control} name="street" render={({ field }) => (
                                                <FormItem><FormLabel>Straat</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                            <FormField control={form.control} name="houseNumber" render={({ field }) => (
                                                <FormItem><FormLabel>Huisnummer</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormField control={form.control} name="postalCode" render={({ field }) => (
                                                <FormItem><FormLabel>Postcode</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                            <FormField control={form.control} name="city" render={({ field }) => (
                                                <FormItem><FormLabel>Stad</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                        </div>
                                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormField control={form.control} name="email" render={({ field }) => (
                                                <FormItem><FormLabel>E-mailadres</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                            <FormField control={form.control} name="phone" render={({ field }) => (
                                                <FormItem><FormLabel>Telefoonnummer</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormField control={form.control} name="kvkNumber" render={({ field }) => (
                                                <FormItem><FormLabel>KVK-nummer</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                            <FormField control={form.control} name="vatNumber" render={({ field }) => (
                                                <FormItem><FormLabel>BTW-nummer</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                        </div>
                                        <FormField control={form.control} name="iban" render={({ field }) => (
                                            <FormItem><FormLabel>IBAN</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </>
                                )}
                            </CardContent>
                             <CardFooter className="flex justify-end">
                                <Button type="submit" disabled={isSubmitting || !form.formState.isDirty}>
                                    {isSubmitting ? (
                                        <Loader2 className="animate-spin mr-2" />
                                    ) : (
                                        <Save className="mr-2 h-4 w-4" />
                                    )}
                                    Wijzigingen Opslaan
                                </Button>
                            </CardFooter>
                        </Card>
                    </form>
                </Form>
            </div>
            <DebugConsole/>
        </div>
    );
}
