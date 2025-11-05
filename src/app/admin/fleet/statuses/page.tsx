

"use client";

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { VehicleStatusOption } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PlusCircle, Trash2, Save, Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';


const statusSchema = z.object({
  label: z.string().min(1, "Status mag niet leeg zijn."),
  isDefault: z.boolean().optional(),
});

const formSchema = z.object({
  statuses: z.array(statusSchema),
}).refine(data => {
    // Ensure there's only one default
    const defaultCount = data.statuses.filter(s => s.isDefault).length;
    return defaultCount <= 1;
}, { message: "Er kan maar één standaard status zijn.", path: ["statuses"] });

type FormValues = z.infer<typeof formSchema>;


export default function StatusManagementPage() {
    const [statuses, setStatuses] = useState<VehicleStatusOption[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const router = useRouter();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            statuses: []
        }
    });

    const { control, handleSubmit, reset, setValue } = form;

    const { fields, append, remove, update } = useFieldArray({
        control,
        name: "statuses"
    });

    useEffect(() => {
        setLoading(true);
        const fetchStatuses = async () => {
            const { data, error } = await supabase
                .from('vehicle_statuses')
                .select('*')
                .order('label');
            if (error) {
                console.error('Error fetching statuses:', error);
                toast({ variant: 'destructive', title: 'Fout bij ophalen statussen' });
            } else {
                const s = (data || []).map(r => ({ id: r.id, label: r.label, isDefault: r.is_default })) as VehicleStatusOption[];
                setStatuses(s);
                reset({ statuses: s.map(({ id, ...rest }) => rest) });
            }
            setLoading(false);
        };
        fetchStatuses();
        const ch = supabase
            .channel('vehicle-statuses')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_statuses' }, fetchStatuses)
            .subscribe();
        return () => { ch.unsubscribe(); };
    }, [toast, reset]);
    
    // Function to handle adding the "Demo" status if it doesn't exist
    useEffect(() => {
        if (!loading && statuses.length > 0) {
            const hasDemo = statuses.some(s => s.label.toLowerCase() === 'demo');
            if (!hasDemo) {
                const addDemoStatus = async () => {
                    try {
                        await supabase.from('vehicle_statuses').insert({ label: 'Demo', is_default: false });
                        toast({ title: 'Demo status toegevoegd' });
                    } catch (error) {
                        console.error('Error adding demo status:', error);
                    }
                };
                addDemoStatus();
            }
        }
    }, [loading, statuses, toast]);

    const handleSetDefault = (index: number) => {
        const currentStatuses = form.getValues('statuses');
        const newStatuses = currentStatuses.map((status, i) => ({
            ...status,
            isDefault: i === index
        }));
        setValue('statuses', newStatuses, { shouldDirty: true });
    };

    const handleRemoveStatus = async (index: number) => {
        const statusToRemove = statuses[index];
        if (!statusToRemove) {
            toast({ variant: 'destructive', title: "Fout", description: "Kon de te verwijderen status niet vinden." });
            return;
        }

        if (statusToRemove.isDefault) {
            toast({ variant: 'destructive', title: "Kan standaard status niet verwijderen" });
            return;
        }
        try {
            await supabase.from('vehicle_statuses').delete().eq('id', statusToRemove.id);
            // No need to call `remove(index)` here, onSnapshot will update the state and re-render
            toast({ title: `Status "${statusToRemove.label}" verwijderd` });
        } catch (error) {
             toast({ variant: 'destructive', title: 'Verwijderen mislukt' });
        }
    }

    const onSubmit = async (data: FormValues) => {
        try {
            // Update existing
            for (let i = 0; i < Math.min(statuses.length, data.statuses.length); i++) {
                const original = statuses[i];
                const updated = data.statuses[i];
                if (original && (original.label !== updated.label || (original.isDefault ?? false) !== (updated.isDefault ?? false))) {
                    const { error } = await supabase
                        .from('vehicle_statuses')
                        .update({ label: updated.label, is_default: updated.isDefault ?? false })
                        .eq('id', original.id);
                    if (error) throw error;
                }
            }
            // Insert new
            const newOnes = data.statuses.slice(statuses.length);
            if (newOnes.length > 0) {
                const { error } = await supabase.from('vehicle_statuses').insert(
                    newOnes.map(s => ({ label: s.label, is_default: s.isDefault ?? false }))
                );
                if (error) throw error;
            }
            toast({ title: 'Statussen opgeslagen' });
            reset(data, { keepDirty: false });
        } catch (error) {
            console.error('Error updating statuses: ', error);
            toast({ variant: 'destructive', title: 'Opslaan Mislukt' });
        }
    };

    return (
        <div className="space-y-8">
            <Button variant="ghost" onClick={() => router.push('/admin/fleet')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Terug naar wagenpark
            </Button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Voertuig Statusbeheer</h1>
                    <p className="text-muted-foreground">Beheer de verschillende statussen die voertuigen kunnen hebben.</p>
                </div>
            </div>
             <Card className="max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle>Statusbeheer Wagenpark</CardTitle>
                    <CardDescription>
                        Beheer hier de statussen die voor voertuigen beschikbaar zijn. Markeer één status als de standaard voor nieuwe voertuigen.
                    </CardDescription>
                </CardHeader>
                <Form {...form}>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <CardContent className="space-y-4">
                            {loading ? (
                                <Skeleton className="h-24 w-full" />
                            ) : (
                                fields.map((field, index) => (
                                    <div key={field.id} className="flex items-center gap-4 p-2 border rounded-md">
                                        <FormField
                                            control={control}
                                            name={`statuses.${index}.label`}
                                            render={({ field }) => (
                                                <FormItem className="flex-grow">
                                                    <FormControl><Input {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                         <FormField
                                            control={control}
                                            name={`statuses.${index}.isDefault`}
                                            render={({ field }) => (
                                                <FormItem className="flex items-center gap-2">
                                                    <FormControl>
                                                        <Switch
                                                            checked={field.value}
                                                            onCheckedChange={() => handleSetDefault(index)}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="pt-2">Standaard</FormLabel>
                                                </FormItem>
                                            )}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveStatus(index)}
                                            disabled={statuses[index]?.isDefault}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))
                            )}
                             <Button type="button" variant="outline" onClick={() => append({ label: '', isDefault: false })}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Status Toevoegen
                            </Button>
                        </CardContent>
                         <CardFooter className="flex justify-end">
                            <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
                                {form.formState.isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                                Wijzigingen Opslaan
                            </Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>
        </div>
    );
}
