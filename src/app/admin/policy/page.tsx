
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase/client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const policySchema = z.object({
  text: z.string().min(10, { message: 'Het beleid moet minimaal 10 tekens bevatten.' }),
});

type PolicyFormData = z.infer<typeof policySchema>;

export default function AdminPolicyPage() {
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const form = useForm<PolicyFormData>({
        resolver: zodResolver(policySchema),
        defaultValues: {
            text: '',
        }
    });

    useEffect(() => {
        const fetchPolicy = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                  .from('company_profile')
                  .select('policy_text')
                  .eq('id', 'main')
                  .maybeSingle();
                if (error) throw error;
                if (data?.policy_text) {
                    form.reset({ text: data.policy_text as string });
                }
            } catch (error) {
                console.error("Error fetching policy:", error);
                toast({ variant: 'destructive', title: "Fout bij ophalen beleid" });
            } finally {
                setLoading(false);
            }
        };
        fetchPolicy();
    }, [form, toast]);

    const onSubmit = async (data: PolicyFormData) => {
        try {
            const { error } = await supabase
              .from('company_profile')
              .upsert({ id: 'main', policy_text: data.text }, { onConflict: 'id' });
            if (error) throw error;
            toast({
                title: "Beleid Opgeslagen",
                description: "Het boetebeleid is succesvol bijgewerkt.",
            });
            form.reset(data); // Reset dirty state
        } catch (error) {
             console.error("Error saving policy:", error);
             toast({ variant: 'destructive', title: "Opslaan Mislukt", description: "Er is een onverwachte fout opgetreden." });
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8">
            <div className="max-w-4xl mx-auto space-y-8">
                 <h1 className="text-3xl font-bold">Boetebeleid</h1>
                <Card>
                    <CardHeader>
                        <CardTitle>Bedrijfsbeleid Boetes</CardTitle>
                        <CardDescription>
                            Voer hier de tekst in die voor chauffeurs zichtbaar zal zijn op hun boetepagina. 
                            Dit helpt om het beleid van de organisatie duidelijk te communiceren.
                        </CardDescription>
                    </CardHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)}>
                             <CardContent>
                                {loading ? (
                                    <Skeleton className="w-full h-64" />
                                ) : (
                                    <FormField
                                        control={form.control}
                                        name="text"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Beleidstekst</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        placeholder="Voer hier het boetebeleid van uw organisatie in..."
                                                        className="min-h-64"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </CardContent>
                            <CardContent className="flex justify-end">
                                <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
                                    {form.formState.isSubmitting ? (
                                        <Loader2 className="animate-spin mr-2" />
                                    ) : (
                                        <Save className="mr-2 h-4 w-4" />
                                    )}
                                    Opslaan
                                </Button>
                            </CardContent>
                        </form>
                    </Form>
                </Card>
            </div>
        </div>
    );
}
