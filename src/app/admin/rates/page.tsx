

"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Customer, MileageRateType } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { getISOWeek, getYear, format, startOfWeek, addDays, set, startOfMonth, endOfMonth, eachWeekOfInterval, addMonths, subMonths, getWeeksInMonth, addWeeks, subWeeks } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Euro, Percent, Save, Loader2, UploadCloud, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { analyzeRateDocument, type AnalyzeRateDocumentInput } from '@/ai/flows/analyze-rate-document-flow';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartXAxis, ChartYAxis, ChartGrid, ChartLine } from '@/components/ui/chart';
import { LineChart } from 'recharts';
import { getWeekIdsForMonth, getWeekIdsForYear } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';


const rateSchema = z.object({
    customerId: z.string(),
    companyName: z.string(),
    mileageRateType: z.enum(['fixed', 'variable', 'dot']),
    rate: z.coerce.number().optional(),
});
const formSchema = z.object({
    rates: z.array(rateSchema)
});
type RateFormData = z.infer<typeof rateSchema>;
type TimeRange = 'month' | 'year';

const formatCurrency = (value: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);


export default function AdminRatesPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedWeek, setSelectedWeek] = useState(new Date());
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [ratesForPeriod, setRatesForPeriod] = useState<Record<string, any> | null>(null);
    const [ratesForWeek, setRatesForWeek] = useState<any>(null);
    const [loadingCustomers, setLoadingCustomers] = useState(true);
    const [loadingRates, setLoadingRates] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [analyzingIndex, setAnalyzingIndex] = useState<number | null>(null);
    const [timeRange, setTimeRange] = useState<TimeRange>('month');
    const { toast } = useToast();

    const selectedWeekId = useMemo(() => `${getYear(selectedWeek)}-${getISOWeek(selectedWeek)}`, [selectedWeek]);

    const { control, handleSubmit, reset, setValue, watch, formState: { isDirty } } = useForm<{ rates: RateFormData[] }>({
        resolver: zodResolver(formSchema),
        defaultValues: { rates: [] }
    });

    const { fields, replace } = useFieldArray({ control, name: "rates" });
    const watchedRates = watch('rates');

    const isWeekComplete = useMemo(() => {
        if (!fields || fields.length === 0) return false;
        return fields.every(field => field.rate !== undefined && field.rate !== null && String(field.rate).trim() !== '');
    }, [fields]);
    
    const customersForRates = useMemo(() => {
        return customers.filter(c => c.mileageRateType === 'variable' || c.mileageRateType === 'dot');
    }, [customers]);

    const weekIdsForPeriod = useMemo(() => {
        return timeRange === 'month' ? getWeekIdsForMonth(currentDate) : getWeekIdsForYear(currentDate);
    }, [currentDate, timeRange]);
    
    const chartData = useMemo(() => {
        if (!ratesForPeriod || customersForRates.length === 0) return [];
        
        return weekIdsForPeriod.map(weekId => {
            const dataPoint: { [key: string]: any } = { week: weekId.split('-')[1] };
            const weeklyRates = ratesForPeriod[weekId]?.customerRates || {};

            customersForRates.forEach(customer => {
                dataPoint[customer.id] = weeklyRates[customer.id] ?? null;
            });
            return dataPoint;
        });
    }, [weekIdsForPeriod, ratesForPeriod, customersForRates]);

    useEffect(() => {
        let active = true;
        const fetchCustomers = async () => {
            const { data, error } = await supabase.from('customers').select('*').order('company_name');
            if (!active) return;
            if (error) {
                console.error("Error fetching customers:", error);
                setLoadingCustomers(false);
                return;
            }
            setCustomers(((data || []).map(r => ({ id: r.id, companyName: r.company_name, mileageRateType: r.mileage_rate_type, ...r })) as any) as Customer[]);
            setLoadingCustomers(false);
        };
        fetchCustomers();
        const ch = supabase.channel('rates-customers').on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchCustomers).subscribe();
        return () => { active = false; ch.unsubscribe(); };
    }, []);
    
    // Fetch data for the graph
    useEffect(() => {
        if (weekIdsForPeriod.length === 0) return;

        setLoadingRates(true);
        const fetchRatesInChunks = async () => {
            const allRates: Record<string, any> = {};
            const chunks = [];
            for (let i = 0; i < weekIdsForPeriod.length; i += 30) {
                chunks.push(weekIdsForPeriod.slice(i, i + 30));
            }

            for (const chunk of chunks) {
                if (chunk.length === 0) continue;
                const { data, error } = await supabase
                  .from('weekly_rates')
                  .select('*')
                  .in('week_id', chunk);
                if (error) { console.error('Error fetching weekly_rates:', error); continue; }
                (data || []).forEach(row => {
                    const weekId = row.week_id as string;
                    if (!allRates[weekId]) allRates[weekId] = { customerRates: {} };
                    allRates[weekId].customerRates[row.customer_id] = Number(row.rate);
                });
            }
            setRatesForPeriod(allRates);
            setLoadingRates(false);
        }
        
        fetchRatesInChunks().catch(err => {
            console.error(err);
            setLoadingRates(false);
        })

    }, [weekIdsForPeriod]);
    
    // Fetch data for the selected week form
    useEffect(() => {
        let active = true;
        const fetchWeek = async () => {
            const { data, error } = await supabase
              .from('weekly_rates')
              .select('*')
              .eq('week_id', selectedWeekId);
            if (!active) return;
            if (error) { console.error('Error fetching weekly_rates week:', error); setRatesForWeek(null); return; }
            const customerRates: Record<string, number> = {};
            (data || []).forEach(r => { customerRates[r.customer_id] = Number(r.rate); });
            setRatesForWeek({ customerRates });
        };
        fetchWeek();
        const ch = supabase.channel('rates-week').on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_rates' }, fetchWeek).subscribe();
        return () => { active = false; ch.unsubscribe(); };
    }, [selectedWeekId]);


    // Update form when data for the selected week changes
    useEffect(() => {
        if (customersForRates.length > 0) {
            const ratesData = ratesForWeek?.customerRates || {};
            const initialFormRates = customersForRates.map(customer => ({
                customerId: customer.id,
                companyName: customer.companyName,
                mileageRateType: customer.mileageRateType ?? 'dot',
                rate: ratesData[customer.id] ?? undefined,
            }));
            replace(initialFormRates);
        } else {
             replace([]);
        }
    }, [customersForRates, ratesForWeek, replace]);
    
    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setAnalyzingIndex(index);
        const rateType = fields[index].mileageRateType;
        let fileContent = '';

        if(file.type.includes('spreadsheetml') || file.type.includes('excel')) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                fileContent = XLSX.utils.sheet_to_csv(worksheet);
                await analyzeAndSetRate(fileContent, rateType as 'dot' | 'variable', index);
            };
            reader.readAsBinaryString(file);
        } else {
            fileContent = await file.text();
            await analyzeAndSetRate(fileContent, rateType as 'dot' | 'variable', index);
        }
    };

    const analyzeAndSetRate = async (content: string, rateType: 'dot' | 'variable', index: number) => {
        try {
            const result = await analyzeRateDocument({ documentContent: content, rateType });
            if (result.rate !== undefined) {
                setValue(`rates.${index}.rate`, result.rate, { shouldDirty: true, shouldValidate: true });
                toast({ title: 'Tarief succesvol geëxtraheerd!', description: `Waarde ${result.rate} is ingevuld.` });
            } else {
                toast({ variant: 'destructive', title: 'Tarief niet gevonden', description: 'De AI kon geen geldig tarief vinden in het document.' });
            }
        } catch (error) {
            console.error("AI analysis failed:", error);
            toast({ variant: 'destructive', title: 'Analyse mislukt' });
        } finally {
            setAnalyzingIndex(null);
        }
    };


    const onSubmit = async (data: { rates: RateFormData[] }) => {
        setIsSubmitting(true);
        const customerRates: Record<string, number> = {};
        data.rates.forEach(r => {
            if (r.rate !== undefined && r.rate !== null && String(r.rate).trim() !== '') {
                customerRates[r.customerId] = Number(r.rate);
            }
        });
        
        try {
            const rows = Object.entries(customerRates).map(([customerId, rate]) => ({ week_id: selectedWeekId, customer_id: customerId, rate }));
            if (rows.length > 0) {
                const { error } = await supabase.from('weekly_rates').upsert(rows, { onConflict: 'week_id,customer_id' });
                if (error) throw error;
            }
            toast({
                title: "Tarieven Opgeslagen",
                description: `De tarieven voor week ${selectedWeekId.split('-')[1]} zijn succesvol opgeslagen.`,
            });
            reset(data);
        } catch (error) {
            console.error("Error saving rates: ", error);
            toast({ variant: 'destructive', title: "Opslaan Mislukt" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const loading = loadingCustomers || loadingRates;

    const chartConfig = useMemo(() => {
        const config: any = {};
        customersForRates.forEach((customer, index) => {
            config[customer.id] = {
                label: customer.companyName,
                color: `hsl(var(--chart-${(index % 5) + 1}))`
            }
        });
        return config;
    }, [customersForRates]);
    
    const handleGraphDateChange = (direction: 'next' | 'prev') => {
        if(timeRange === 'month') {
            setCurrentDate(direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
        } else {
            setCurrentDate(direction === 'next' ? addMonths(currentDate, 12) : subMonths(currentDate, 12));
        }
    }

    const handleWeekChange = (direction: 'next' | 'prev') => {
        setSelectedWeek(direction === 'next' ? addWeeks(selectedWeek, 1) : subWeeks(selectedWeek, 1));
    }
    
    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8">
             <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Wekelijks Tarievenbeheer</h1>
                    <p className="text-muted-foreground">Voer hier de wekelijkse DOT percentages of variabele kilometertarieven per klant in.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                             <Button variant="ghost" size="icon" onClick={() => handleGraphDateChange('prev')}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                                <TabsList>
                                     <TabsTrigger value="month" className="capitalize">{format(currentDate, 'LLLL yyyy', { locale: nl })}</TabsTrigger>
                                     <TabsTrigger value="year">{format(currentDate, 'yyyy', { locale: nl })}</TabsTrigger>
                                </TabsList>
                            </Tabs>
                            <Button variant="ghost" size="icon" onClick={() => handleGraphDateChange('next')}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4">
                         {loading ? (
                            <Skeleton className="h-[250px] w-full" />
                         ) : chartData.length > 0 ? (
                            <ChartContainer config={chartConfig} className="w-full h-[250px]">
                                <LineChart data={chartData}>
                                    <ChartGrid vertical={false} />
                                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                                     <ChartXAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
                                     <ChartYAxis yAxisId="dot" orientation="left" stroke="hsl(var(--chart-1))" tickFormatter={(value) => `${value}%`} />
                                     <ChartYAxis yAxisId="variable" orientation="right" stroke="hsl(var(--chart-2))" tickFormatter={(value) => `€${value}`} />
                                    {customersForRates.map(customer => (
                                        <ChartLine 
                                            key={customer.id} 
                                            dataKey={customer.id} 
                                            type="monotone" 
                                            stroke={chartConfig[customer.id]?.color} 
                                            strokeWidth={2}
                                            yAxisId={customer.mileageRateType === 'dot' ? 'dot' : 'variable'}
                                        />
                                    ))}
                                    <ChartLegend content={<ChartLegendContent />} />
                                </LineChart>
                            </ChartContainer>
                         ) : (
                            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                                Geen data om weer te geven in de grafiek.
                            </div>
                         )}
                    </CardContent>
                </Card>

                <Card className="flex flex-col">
                    <CardHeader>
                         <div className="flex justify-between items-center">
                            <Button variant="ghost" size="icon" onClick={() => handleWeekChange('prev')}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className='text-center'>
                                <CardTitle className="font-headline">
                                    Week {getISOWeek(selectedWeek)} ({getYear(selectedWeek)})
                                </CardTitle>
                                <p className="text-sm font-normal text-muted-foreground">
                                    {format(startOfWeek(selectedWeek, {weekStartsOn:1}), 'd MMM', {locale: nl})} - {format(addDays(startOfWeek(selectedWeek, {weekStartsOn:1}), 6), 'd MMM yyyy', {locale: nl})}
                                </p>
                            </div>
                             <Button variant="ghost" size="icon" onClick={() => handleWeekChange('next')}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-grow">
                        <CardContent className="flex-grow">
                            <div className="border rounded-md">
                                <div className="grid grid-cols-[1fr_200px] font-medium p-4 border-b bg-muted/50">
                                    <div>Klant</div>
                                    <div className="text-right">Tarief / DOT %</div>
                                </div>
                                <div>
                                {loading ? (
                                    <div className="p-4 space-y-2">
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                        <Skeleton className="h-10 w-full" />
                                    </div>
                                ) : fields.length > 0 ? (
                                    fields.map((field, index) => {
                                        const rateValue = watchedRates?.[index]?.rate;
                                        const isFilled = rateValue !== undefined && rateValue !== null && String(rateValue).trim() !== '';
                                        return (
                                        <div key={field.id} className="grid grid-cols-[1fr_200px] items-center p-4 border-b last:border-b-0">
                                            <div>
                                                <p className="font-medium">{field.companyName}</p>
                                                <p className="text-xs text-muted-foreground">{field.mileageRateType === 'dot' ? 'DOT %' : 'Variabel tarief'}</p>
                                            </div>
                                            <Controller
                                                control={control}
                                                name={`rates.${index}.rate`}
                                                render={({ field: controllerField }) => (
                                                    <div className="relative flex items-center gap-2">
                                                        {field.mileageRateType === 'dot' 
                                                            ? <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                            : <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        }
                                                        <Input 
                                                            type="number" 
                                                            step="0.01" 
                                                            className="pl-9 text-right"
                                                            placeholder={field.mileageRateType === 'dot' ? '12.5' : '1.25'}
                                                            {...controllerField}
                                                            value={controllerField.value ?? ''}
                                                            onChange={(e) => controllerField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                                        />
                                                        {isFilled ? (
                                                            <div className="w-10 flex justify-center">
                                                                <CheckCircle className="h-5 w-5 text-green-500" />
                                                            </div>
                                                        ) : (
                                                            <Button type="button" variant="ghost" size="icon" asChild>
                                                                <label>
                                                                    {analyzingIndex === index ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                                                                    <input type="file" className="sr-only" onChange={(e) => handleFileChange(e, index)} accept=".xlsx, .xls, .csv, .txt, .eml" />
                                                                </label>
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            />
                                        </div>
                                        )
                                    })
                                ) : (
                                    <div className="text-center p-8 text-muted-foreground">
                                        Geen klanten met een variabel of DOT-tarief gevonden.
                                    </div>
                                )}
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end items-center gap-4 pt-4">
                            {isWeekComplete && <CheckCircle className="h-5 w-5 text-green-500" />}
                            <Button type="submit" disabled={isSubmitting || !isDirty || fields.length === 0}>
                                {isSubmitting ? (
                                    <Loader2 className="animate-spin mr-2" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Opslaan
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}
