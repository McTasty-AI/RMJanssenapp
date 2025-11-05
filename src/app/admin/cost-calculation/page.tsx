
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { salaryScales } from '@/lib/salary-data';
import { cn, mapSupabaseToApp } from '@/lib/utils';
import { getYear, eachDayOfInterval, startOfYear, endOfYear, getDay, parseISO } from 'date-fns';
import { holidays } from '@/lib/holidays';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { generateCostCalculationPdfAction } from '@/app/actions/generateCostCalculationPdfAction';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download, Save, Plus, Minus, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { Vehicle, CostCalculationData } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearchParams } from 'next/navigation';

const formatCurrency = (value: number, digits = 2) => {
    if (isNaN(value)) return '€ 0,00';
    return `€ ${value.toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

const formatNumber = (value?: number, digits = 0) => {
    const n = typeof value === 'number' ? value : NaN;
    if (Number.isNaN(n)) return '0';
    return n.toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const inputClass = "h-8 bg-blue-100/50 text-blue-900 border-blue-300 focus-visible:ring-blue-500 disabled:bg-gray-200 disabled:opacity-70";
const calculatedClass = "h-8 bg-gray-100 border-gray-300 text-right";

const Section = ({ title, children, className, control, switchName, switchLabel }: { title: string, children: React.ReactNode, className?: string, control?: any, switchName?: string, switchLabel?: string }) => (
    <Card className={cn("flex-grow", className)}>
        <CardHeader className="relative">
            <CardTitle className="text-lg">{title}</CardTitle>
             {control && switchName && (
                <div className="absolute top-6 right-6">
                    <FormField
                        control={control}
                        name={switchName}
                        render={({ field }) => (
                            <FormItem className="flex items-center gap-2 space-y-0">
                                {switchLabel && <FormLabel className="text-sm font-normal">{switchLabel}</FormLabel>}
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </div>
            )}
        </CardHeader>
        <CardContent className="space-y-2">{children}</CardContent>
    </Card>
);

const Field = ({ label, unit, children, disabled }: { label: string, unit?: string, children: React.ReactNode, disabled?: boolean }) => (
    <div className="grid grid-cols-[1fr_50px_100px] items-center gap-2">
        <Label className={cn(disabled && "line-through text-muted-foreground")}>{label}</Label>
        {unit && <span className="text-sm text-muted-foreground text-center">{unit}</span>}
        {!unit && <div/>}
        <div>{children}</div>
    </div>
);

const CalcField = ({ label, value, sign }: { label: string, value: string, sign?: 'plus' | 'minus' }) => (
    <div className="grid grid-cols-[1fr_100px_20px] items-center gap-2">
        <Label>{label}</Label>
        <Input value={value} className={cn(calculatedClass, sign === 'minus' && 'text-red-600')} readOnly />
        <div className="flex justify-center">
            {sign === 'plus' && <Plus className="h-4 w-4 text-muted-foreground" />}
            {sign === 'minus' && <Minus className="h-4 w-4 text-red-500" />}
        </div>
    </div>
);

const defaultValues: CostCalculationData = {
    purchaseValue: 70000,
    tireCount: 6,
    tireCost: 500,
    tireLifetime: 300000,
    residualValue: 0,
    economicLifetime: 6,
    expectedYearlyKm: 120000,
    fuelConsumption: 3.1,
    fuelPrice: 1.46,
    oilAndLubricants: 200,
    periodicMaintenance: 975,
    repairCost: 5000,
    mrb: 1000,
    eurovignette: 1250,
    interestRate: 3,
    truckInsurance: 6000,
    includeTruck: true,
    salaryScale: 'D',
    salaryStep: 6,
    driverAge: 42,
    overtime130: 5,
    overtime150: 0,
    surcharge19Hours: 0,
    structuralSurchargePercentage: 0,
    vacationDays: 24,
    sickDays: 5,
    waitingDays: 0,
    travelAllowanceKm: 0,
    otherCosts: 0,
    dailyUnaxedAllowance: 0,
    includePersonnel: true,
    socialCharges: 18.2,
    pension: 12.2,
    trailerPurchaseValue: 0,
    trailerTireCount: 6,
    trailerTireCost: 500,
    trailerTireLifetime: 300000,
    trailerResidualValue: 0,
    trailerEconomicLifetime: 99999,
    trailerRepairCost: 0,
    trailerInsurance: 500,
    includeTrailer: true,
    phoneCosts: 1200,
    serviceVehicles: 0,
    managementSalary: 0,
    tlnCosts: 2000,
    rent: 6000,
    numVehicles: 5,
    generalInsurance: 500,
};


export default function CostCalculationPage() {
    const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
    const [pdfTitle, setPdfTitle] = useState('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const { toast } = useToast();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('template');
    const [loading, setLoading] = useState(true);
    const searchParams = useSearchParams();
    const vehicleIdFromUrl = searchParams.get('vehicleId');


    const methods = useForm({
        defaultValues: defaultValues
    });

    const { register, watch, control, setValue, getValues, reset, formState: { isDirty } } = methods;
    const watchedValues = watch();
    const selectedSalaryScale = watch('salaryScale');
    const LOCAL_STORAGE_KEY = 'costCalculationTemplate';

    // Fetch vehicles
    useEffect(() => {
        let active = true;
        const fetchVehicles = async () => {
            const { data, error } = await supabase.from('vehicles').select('*').order('license_plate');
            if (!active) return;
            if (error) { console.error('Error fetching vehicles:', error); setLoading(false); return; }
            const mapped = ((data || []).map(row => mapSupabaseToApp<Vehicle>(row))).filter(v => v.status !== 'Inactief' && v.status !== 'Verkocht');
            setVehicles(mapped);
            setLoading(false);
        };
        fetchVehicles();
        const ch = supabase.channel('costcalc-vehicles').on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, fetchVehicles).subscribe();
        return () => { active = false; ch.unsubscribe(); };
    }, []);

    // Effect for setting vehicle from URL param
    useEffect(() => {
        if (vehicleIdFromUrl && vehicles.length > 0) {
            const vehicleExists = vehicles.some(v => v.id === vehicleIdFromUrl);
            if (vehicleExists) {
                setSelectedVehicleId(vehicleIdFromUrl);
            }
        }
    }, [vehicleIdFromUrl, vehicles]);

    // Load data when a vehicle is selected
    useEffect(() => {
        if (selectedVehicleId === 'template') {
            // Load from local storage if no vehicle is selected
            const savedTemplate = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (savedTemplate) {
                try {
                    const parsedTemplate = JSON.parse(savedTemplate);
                    reset(parsedTemplate);
                } catch (error) {
                    reset(defaultValues);
                }
            } else {
                reset(defaultValues);
            }
            return;
        }

        const vehicle = vehicles.find(v => v.id === selectedVehicleId);
        if (vehicle) {
            if (vehicle.costCalculation) {
                reset(vehicle.costCalculation);
                toast({ title: `Kostprijsberekening voor ${vehicle.licensePlate} geladen.` });
            } else {
                // If no saved data, use template
                const savedTemplate = localStorage.getItem(LOCAL_STORAGE_KEY);
                if (savedTemplate) reset(JSON.parse(savedTemplate));
                else reset(defaultValues);
                toast({ title: 'Geen opgeslagen data', description: `Standaard sjabloon geladen voor ${vehicle.licensePlate}.` });
            }
        }
    }, [selectedVehicleId, vehicles, reset, toast]);

    const handleSave = async () => {
        if (selectedVehicleId === 'template') {
             // Save as generic template if no vehicle is selected
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(getValues()));
                toast({ title: 'Sjabloon opgeslagen', description: 'De huidige waarden worden de volgende keer automatisch geladen.' });
                reset(getValues()); // reset dirty state
            } catch (error) {
                toast({ variant: 'destructive', title: 'Opslaan sjabloon mislukt' });
            }
            return;
        }

        // Save to Supabase for the selected vehicle
        try {
            const formData = getValues();
            const { error } = await supabase
              .from('vehicles')
              .update({ cost_calculation: formData })
              .eq('id', selectedVehicleId);
            if (error) {
                console.error('Error saving cost calculation:', error);
                throw error;
            }
            toast({ title: `Kostprijs opgeslagen`, description: `De berekening is opgeslagen voor voertuig ${vehicles.find(v => v.id === selectedVehicleId)?.licensePlate}.` });
            reset(formData); // reset dirty state
        } catch (error: any) {
            console.error('Save failed:', error);
            toast({ 
                variant: 'destructive', 
                title: 'Opslaan mislukt',
                description: error?.message || 'Er is een fout opgetreden bij het opslaan van de kostprijsberekening.'
            });
        }
    };


    // Effect to reset salary step when scale changes
    useEffect(() => {
        if (selectedSalaryScale && salaryScales[selectedSalaryScale]) {
            const firstStep = Object.keys(salaryScales[selectedSalaryScale])[0];
            setValue('salaryStep', Number(firstStep));
        }
    }, [selectedSalaryScale, setValue]);

    const workableDaysInYear = useMemo(() => {
        const year = getYear(new Date());
        const yearStart = startOfYear(new Date(year, 0, 1));
        const yearEnd = endOfYear(new Date(year, 11, 31));
        const allDays = eachDayOfInterval({ start: yearStart, end: yearEnd });

        const yearHolidays = holidays
            .filter(h => getYear(h.date) === year)
            .map(h => h.date.toISOString().split('T')[0]);

        return allDays.filter(day => {
            const dayOfWeek = getDay(day);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isHoliday = yearHolidays.includes(day.toISOString().split('T')[0]);
            return !isWeekend && !isHoliday;
        }).length;
    }, []);

    const calculations = useMemo(() => {
        const num = (value: any): number => (typeof value === 'number' && !isNaN(value) ? value : 0);

        const {
            includeTruck, includeTrailer, includePersonnel,
        } = watchedValues;
        
        const purchaseValue = num(watchedValues.purchaseValue);
        const tireCount = num(watchedValues.tireCount);
        const tireCost = num(watchedValues.tireCost);
        const tireLifetime = num(watchedValues.tireLifetime);
        const residualValue = num(watchedValues.residualValue);
        const economicLifetime = num(watchedValues.economicLifetime);
        const expectedYearlyKm = num(watchedValues.expectedYearlyKm);
        const fuelConsumption = num(watchedValues.fuelConsumption);
        const fuelPrice = num(watchedValues.fuelPrice);
        const oilAndLubricants = num(watchedValues.oilAndLubricants);
        const periodicMaintenance = num(watchedValues.periodicMaintenance);
        const repairCost = num(watchedValues.repairCost);
        const mrb = num(watchedValues.mrb);
        const eurovignette = num(watchedValues.eurovignette);
        const interestRate = num(watchedValues.interestRate);
        const truckInsurance = num(watchedValues.truckInsurance);

        const salaryScale = watchedValues.salaryScale;
        const salaryStep = num(watchedValues.salaryStep);
        const overtime130 = num(watchedValues.overtime130);
        const overtime150 = num(watchedValues.overtime150);
        const surcharge19Hours = num(watchedValues.surcharge19Hours);
        const structuralSurchargePercentage = num(watchedValues.structuralSurchargePercentage);
        const vacationDays = num(watchedValues.vacationDays);
        const sickDays = num(watchedValues.sickDays);
        const waitingDays = num(watchedValues.waitingDays);
        const travelAllowanceKm = num(watchedValues.travelAllowanceKm);
        const otherCosts = num(watchedValues.otherCosts);
        const dailyUnaxedAllowance = num(watchedValues.dailyUnaxedAllowance);
        const socialCharges = num(watchedValues.socialCharges);
        const pension = num(watchedValues.pension);
        
        const trailerPurchaseValue = num(watchedValues.trailerPurchaseValue);
        const trailerTireCost = num(watchedValues.trailerTireCost);
        const trailerTireCount = num(watchedValues.trailerTireCount);
        const trailerTireLifetime = num(watchedValues.trailerTireLifetime);
        const trailerResidualValue = num(watchedValues.trailerResidualValue);
        const trailerEconomicLifetime = num(watchedValues.trailerEconomicLifetime);
        const trailerRepairCost = num(watchedValues.trailerRepairCost);
        const trailerInsurance = num(watchedValues.trailerInsurance);

        const phoneCosts = num(watchedValues.phoneCosts);
        const serviceVehicles = num(watchedValues.serviceVehicles);
        const managementSalary = num(watchedValues.managementSalary);
        const tlnCosts = num(watchedValues.tlnCosts);
        const rent = num(watchedValues.rent);
        const numVehicles = num(watchedValues.numVehicles);
        const generalInsurance = num(watchedValues.generalInsurance);

        const emptySalary = { week: 0, month: 0, hour100: 0, hour130: 0, hour150: 0 };
        const salaryData = (salaryScale && salaryScales[salaryScale] && salaryScales[salaryScale][salaryStep]) 
            ? salaryScales[salaryScale][salaryStep]
            : emptySalary;

        // Specificatie Diensturen Berekeningen
        const diensturen = workableDaysInYear * 8;
        const vakantieUren = vacationDays * 8;
        const atvUren = 3.5 * 8; // Fixed
        const ziekteUren = sickDays * 8;
        const overuren130Calc = overtime130 * 50.5;
        const overuren150Calc = overtime150 * 50.5;
        const productiveHoursYear = diensturen - vakantieUren - atvUren - ziekteUren + overuren130Calc + overuren150Calc;


        // Vrachtauto
        const depreciationTruck = (purchaseValue - residualValue) / (economicLifetime || 1);
        const totalTireCost = tireCount * tireCost;
        const interestCosts = ((purchaseValue + residualValue) / 2) * (interestRate / 100);

        // Oplegger
        const depreciationTrailer = (trailerPurchaseValue - trailerResidualValue) / (trailerEconomicLifetime || 1);
        const totalTrailerTireCost = trailerTireCount * trailerTireCost;
        const trailerDepreciationTiresPerKm = totalTrailerTireCost / (trailerTireLifetime || 1);

        // Vaste kosten
        const fixedCosts = {
            depreciationTruck: includeTruck ? depreciationTruck : 0,
            depreciationTrailer: includeTrailer ? depreciationTrailer : 0,
            interestCosts: includeTruck ? interestCosts : 0, 
            mrb: includeTruck ? mrb : 0, 
            eurovignette: includeTruck ? eurovignette : 0, 
            truckInsurance: includeTruck ? truckInsurance : 0,
            trailerInsurance: includeTrailer ? trailerInsurance : 0,
            periodicMaintenance: includeTruck ? periodicMaintenance : 0,
            trailerRepairCost: includeTrailer ? trailerRepairCost : 0,
            leaseCosts: 0, // Placeholder
            get total() { return this.depreciationTruck + this.depreciationTrailer + this.interestCosts + this.mrb + this.eurovignette + this.truckInsurance + this.trailerInsurance + this.periodicMaintenance + this.trailerRepairCost + this.leaseCosts }
        };

        // Variabele kosten
        const variableCosts = {
            depreciationTiresPerKm: includeTruck ? totalTireCost / (tireLifetime || 1) : 0,
            depreciationTrailerTiresPerKm: includeTrailer ? trailerDepreciationTiresPerKm : 0,
            fuelCostPerKm: includeTruck ? fuelPrice / (fuelConsumption || 1) : 0,
            oilPerKm: includeTruck ? oilAndLubricants / (expectedYearlyKm || 1) : 0,
            repairCostPerKm: includeTruck ? repairCost / (expectedYearlyKm || 1) : 0,
            get totalPerKm() { return this.depreciationTiresPerKm + this.depreciationTrailerTiresPerKm + this.fuelCostPerKm + this.oilPerKm + this.repairCostPerKm },
            get yearlyTotal() { return this.totalPerKm * expectedYearlyKm }
        };
        
        // Personeel & Loonkosten
        const yearlyBaseSalary = salaryData.month * 12;
        const yearlyOvertime130 = (overtime130 * 52) * salaryData.hour130;
        const yearlyOvertime150 = (overtime150 * 52) * salaryData.hour150;
        const yearlyShiftSurcharge = (surcharge19Hours * (salaryData.hour100 * 0.19)) * 52;
        const yearlyStructuralSurcharge = (structuralSurchargePercentage / 100) * yearlyBaseSalary;
        
        const travelDays = workableDaysInYear - vacationDays - sickDays - 3.5;
        const travelAllowance = (travelAllowanceKm * 2 * travelDays) * 0.23;
        const dailyUnaxedAllowanceYearly = dailyUnaxedAllowance * travelDays;
        
        const costSickDays = (sickDays - waitingDays) * (salaryData.week / 5);
        const vacationAllowance = (yearlyBaseSalary + yearlyOvertime130 + yearlyOvertime150) * 0.08;
        
        const dailyFunctionWage = salaryData.week / 5;
        const dailyShiftComponent = (yearlyShiftSurcharge / workableDaysInYear) * 0.90;
        const wageComponent = dailyFunctionWage * 0.2275;
        const valueOfVacationDay = dailyFunctionWage + dailyShiftComponent + wageComponent;
        const totalValueOfVacationDays = valueOfVacationDay * vacationDays;

        const grossSalary = yearlyBaseSalary + yearlyOvertime130 + yearlyOvertime150 + yearlyShiftSurcharge + yearlyStructuralSurcharge + costSickDays + travelAllowance + dailyUnaxedAllowanceYearly + vacationAllowance + totalValueOfVacationDays;
        const socialChargesAmount = grossSalary * (socialCharges / 100);
        const pensionAmount = grossSalary * (pension / 100);
        const totalPersonnelCosts = includePersonnel ? grossSalary + socialChargesAmount + pensionAmount + otherCosts : 0;


        // Algemene kosten
        const generalCosts = {
            phoneCosts, serviceVehicles, managementSalary, tlnCosts, rent, generalInsurance,
            get total() { return this.phoneCosts + this.serviceVehicles + this.managementSalary + this.tlnCosts + this.rent + this.generalInsurance },
            get perVehicle() { return this.total / (numVehicles || 1) }
        };
        
        // Total costs
        const totalYearlyCosts = fixedCosts.total + variableCosts.yearlyTotal + totalPersonnelCosts + generalCosts.perVehicle;

        // Tariefstelling
        const tariffs = {
             // Scenario 1: Gecombineerd (EN)
            combinedKmRate: variableCosts.totalPerKm,
            combinedHourRate: (fixedCosts.total + totalPersonnelCosts + generalCosts.perVehicle) / (productiveHoursYear || 1),
            // Scenario 2: All-in (OF)
            allInKmRate: totalYearlyCosts / (expectedYearlyKm || 1),
            allInHourRate: totalYearlyCosts / (productiveHoursYear || 1),
        };
        
        // Jaaromzet
        const revenue = {
            // Based on combined rate
            kmRevenue: tariffs.combinedKmRate * expectedYearlyKm,
            hourRevenue: tariffs.combinedHourRate * productiveHoursYear,
            get totalCombined() { return this.kmRevenue + this.hourRevenue },
            // Based on all-in rates
            get totalAllInKm() { return tariffs.allInKmRate * expectedYearlyKm },
            get totalAllInHour() { return tariffs.allInHourRate * productiveHoursYear },
        };


        return {
            diensturen,
            vakantieUren,
            atvUren,
            ziekteUren,
            overuren130: overuren130Calc,
            overuren150: overuren150Calc,
            productiveHoursYear,
            fixedCosts,
            variableCosts,
            salaryData,
            yearlyBaseSalary,
            yearlyOvertime130,
            yearlyOvertime150,
            yearlyShiftSurcharge,
            yearlyStructuralSurcharge,
            costSickDays,
            travelAllowance,
            dailyUnaxedAllowanceYearly,
            vacationAllowance,
            grossSalary,
            socialChargesAmount,
            pensionAmount,
            totalPersonnelCosts,
            totalValueOfVacationDays,
            generalCosts,
            tariffs,
            revenue
        };

    }, [watchedValues, workableDaysInYear]);

    const handleGeneratePdf = async () => {
        if (!pdfTitle) {
            toast({ variant: "destructive", title: "Titel is verplicht" });
            return;
        }
        setIsGeneratingPdf(true);
        try {
            const blob = await generateCostCalculationPdfAction({
                title: pdfTitle,
                inputs: getValues(), // Use getValues to ensure latest data is used
                calculations: calculations
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${pdfTitle.replace(/ /g, '_')}_kostprijs.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setIsPdfDialogOpen(false);
            setPdfTitle('');
        } catch (error) {
            console.error("PDF generation failed", error);
            toast({ variant: 'destructive', title: "PDF genereren mislukt" });
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto p-4 md:p-8 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-svh w-full" />
            </div>
        );
    }

    return (
        <FormProvider {...methods}>
          <Form {...methods}>
            <div className="container mx-auto p-4 md:p-8 space-y-4">
                 <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold">Kostprijsberekening</h1>
                     <div className="flex gap-2">
                        <Button variant="outline" onClick={handleSave} disabled={!isDirty}>
                            <Save className="mr-2 h-4 w-4" />
                             {selectedVehicleId === 'template' ? 'Sjabloon Opslaan' : 'Kostprijs Opslaan'}
                        </Button>
                        <Dialog open={isPdfDialogOpen} onOpenChange={setIsPdfDialogOpen}>
                            <DialogTrigger asChild>
                                <Button>
                                    <Download className="mr-2 h-4 w-4" />
                                    Exporteer naar PDF
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>PDF Exporteren</DialogTitle>
                                    <DialogDescription>
                                        Geef een titel op voor de PDF-export van deze kostprijsberekening.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="pdf-title" className="text-right">
                                            Titel
                                        </Label>
                                        <Input
                                            id="pdf-title"
                                            value={pdfTitle}
                                            onChange={(e) => setPdfTitle(e.target.value)}
                                            className="col-span-3"
                                            placeholder="bv. Kostprijs DAF XG 2024"
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleGeneratePdf} disabled={isGeneratingPdf}>
                                        {isGeneratingPdf && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Genereer PDF
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
                 <div className="max-w-xs">
                    <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                        <SelectTrigger>
                            <Truck className="mr-2 h-4 w-4 text-muted-foreground" />
                            <SelectValue placeholder="Selecteer een voertuig..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="template">Algemeen Sjabloon</SelectItem>
                            {vehicles.map(v => (
                                <SelectItem key={v.id} value={v.id}>{v.licensePlate} ({v.make} {v.model})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    {/* Column 1: Inputs */}
                    <div className="space-y-6">
                        <Section title="Vrachtauto" control={control} switchName="includeTruck" switchLabel="Meenemen in berekening">
                             <Field label="Aanschafwaarde"><Input {...register("purchaseValue", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Aantal banden"><Input {...register("tireCount", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Kosten banden" unit="€"><Input {...register("tireCost", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Levensduur banden" unit="KM"><Input {...register("tireLifetime", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Restwaarde" unit="€"><Input {...register("residualValue", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Economische levensduur"><Input {...register("economicLifetime", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Verwachte jaar kilometers"><Input {...register("expectedYearlyKm", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Brandstofverbruik" unit="1L per"><Input {...register("fuelConsumption", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Actuele brandstofprijs" unit="€"><Input {...register("fuelPrice", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Olie en smeermiddelen" unit="€"><Input {...register("oilAndLubricants", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck}/></Field>
                             <Field label="Periodiek onderhoud APK" unit="€"><Input {...register("periodicMaintenance", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Reparatiekosten" unit="€"><Input {...register("repairCost", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Verzekering" unit="€"><Input {...register("truckInsurance", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="MRB" unit="€"><Input {...register("mrb", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Eurovignet" unit="€"><Input {...register("eurovignette", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                             <Field label="Rentepercentage" unit="%"><Input {...register("interestRate", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTruck} /></Field>
                        </Section>
                        <Section title="Oplegger" control={control} switchName="includeTrailer" switchLabel="Meenemen in berekening">
                             <Field label="Aanschafwaarde" unit="€"><Input {...register("trailerPurchaseValue", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTrailer} /></Field>
                             <Field label="Banden"><Input {...register("trailerTireCount", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTrailer} /></Field>
                             <Field label="Kosten banden" unit="€"><Input {...register("trailerTireCost", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTrailer} /></Field>
                             <Field label="Levensduur banden"><Input {...register("trailerTireLifetime", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTrailer} /></Field>
                             <Field label="Restwaarde" unit="€"><Input {...register("trailerResidualValue", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTrailer} /></Field>
                             <Field label="Economische levensduur"><Input {...register("trailerEconomicLifetime", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTrailer} /></Field>
                             <Field label="Reparatiekosten" unit="€"><Input {...register("trailerRepairCost", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTrailer} /></Field>
                             <Field label="Verzekering" unit="€"><Input {...register("trailerInsurance", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includeTrailer} /></Field>
                        </Section>
                         <Section title="Personeelskosten" control={control} switchName="includePersonnel" switchLabel="Meenemen in berekening">
                            <div className="grid grid-cols-2 gap-2">
                                <Controller
                                    name="salaryScale"
                                    control={control}
                                    render={({ field }) => (
                                        <Select onValueChange={field.onChange} value={field.value} disabled={!watchedValues.includePersonnel}>
                                            <SelectTrigger className={inputClass}><SelectValue placeholder="Schaal" /></SelectTrigger>
                                            <SelectContent>{Object.keys(salaryScales).map(s => <SelectItem key={s} value={s}>Schaal {s}</SelectItem>)}</SelectContent>
                                        </Select>
                                    )}
                                />
                                <Controller
                                    name="salaryStep"
                                    control={control}
                                    render={({ field }) => (
                                        <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)} disabled={!watchedValues.includePersonnel}>
                                            <SelectTrigger className={inputClass}><SelectValue placeholder="Trede"/></SelectTrigger>
                                            <SelectContent>{Object.keys((watchedValues.salaryScale ? (salaryScales as any)[watchedValues.salaryScale] : {}) || {}).map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>
                            <Field label="Leeftijd chauffeur"><Input {...register("driverAge", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Field label="Uren 100% per week"><Input value="40" className={calculatedClass} readOnly /></Field>
                            <Field label="Uren 130% per week"><Input {...register("overtime130", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Field label="Uren 150% per week"><Input {...register("overtime150", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Field label="Aantal werkbare dagen"><Input value={workableDaysInYear} className={calculatedClass} readOnly /></Field>
                            <Field label="Toeslaguren 19% per week"><Input {...register("surcharge19Hours", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Field label="Structurele Toeslag %"><Input {...register("structuralSurchargePercentage", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Separator/>
                            <p className="font-medium text-sm">Onbelaste vergoedingen</p>
                            <Field label="Vakantiedagen per jaar"><Input {...register("vacationDays", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Field label="Ziektedagen per jaar"><Input {...register("sickDays", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Field label="Wachtdagen per jaar"><Input {...register("waitingDays", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Field label="Onbelaste vergoeding p/d" unit="€"><Input {...register("dailyUnaxedAllowance", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Field label="Reiskilometers" unit="per dag"><Input {...register("travelAllowanceKm", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Field label="Overige kosten per jaar" unit="€"><Input {...register("otherCosts", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Separator/>
                            <p className="font-medium text-sm">Sociale Lasten & Pensioen</p>
                            <Field label="Sociale lasten" unit="%"><Input {...register("socialCharges", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                            <Field label="Pensioen" unit="%"><Input {...register("pension", { valueAsNumber: true })} className={inputClass} disabled={!watchedValues.includePersonnel} /></Field>
                        </Section>
                         <Section title="Algemene Kosten">
                            <Field label="Algemene verzekeringen" unit="€"><Input {...register("generalInsurance", { valueAsNumber: true })} className={inputClass} /></Field>
                            <Field label="Telefoonkosten" unit="€"><Input {...register("phoneCosts", { valueAsNumber: true })} className={inputClass} /></Field>
                            <Field label="Servicewagens" unit="€"><Input {...register("serviceVehicles", { valueAsNumber: true })} className={inputClass} /></Field>
                            <Field label="Lonen directie" unit="€"><Input {...register("managementSalary", { valueAsNumber: true })} className={inputClass} /></Field>
                            <Field label="Kosten TLN" unit="€"><Input {...register("tlnCosts", { valueAsNumber: true })} className={inputClass} /></Field>
                            <Field label="Huur" unit="€"><Input {...register("rent", { valueAsNumber: true })} className={inputClass} /></Field>
                            <Field label="Aantal wagens"><Input {...register("numVehicles", { valueAsNumber: true })} className={inputClass} /></Field>
                         </Section>
                    </div>

                     {/* Column 2: Outputs */}
                    <div className="space-y-6">
                       <Section title="Specificatie Diensturen">
                            <CalcField label="Diensturen" value={formatNumber(calculations.diensturen, 0)} />
                            <CalcField label="Vakantie" value={formatNumber(calculations.vakantieUren, 0)} sign="minus" />
                            <CalcField label="ATV" value={formatNumber(calculations.atvUren, 0)} sign="minus" />
                            <CalcField label="Verzuim / ziek" value={formatNumber(calculations.ziekteUren, 0)} sign="minus" />
                            <CalcField label="Overuren 130%" value={formatNumber(calculations.overuren130, 0)} sign="plus" />
                            <CalcField label="Overuren 150%" value={formatNumber(calculations.overuren150, 0)} sign="plus" />
                            <Separator/>
                            <div className="grid grid-cols-[1fr_100px_20px] items-center gap-2">
                                <Label className="font-bold">Productieve uren</Label>
                                <Input value={formatNumber(calculations.productiveHoursYear, 0)} className={cn(calculatedClass, "font-bold")} readOnly/>
                                <div></div>
                            </div>
                         </Section>
                        <Section title="Overzicht Vaste Kosten">
                            <Field label="Afschrijving vrachtwagen" unit="€" disabled={!watchedValues.includeTruck}><Input value={formatCurrency(calculations.fixedCosts.depreciationTruck, 0)} className={cn(calculatedClass, !watchedValues.includeTruck && "line-through")} readOnly/></Field>
                            <Field label="Afschrijving oplegger" unit="€" disabled={!watchedValues.includeTrailer}><Input value={formatCurrency(calculations.fixedCosts.depreciationTrailer, 0)} className={cn(calculatedClass, !watchedValues.includeTrailer && "line-through")} readOnly /></Field>
                            <Field label="Rentekosten" unit="€" disabled={!watchedValues.includeTruck}><Input value={formatCurrency(calculations.fixedCosts.interestCosts, 0)} className={cn(calculatedClass, !watchedValues.includeTruck && "line-through")} readOnly /></Field>
                            <Field label="Verzekering vrachtwagen" unit="€" disabled={!watchedValues.includeTruck}><Input value={formatCurrency(calculations.fixedCosts.truckInsurance, 0)} className={cn(calculatedClass, !watchedValues.includeTruck && "line-through")} readOnly/></Field>
                            <Field label="Verzekering oplegger" unit="€" disabled={!watchedValues.includeTrailer}><Input value={formatCurrency(calculations.fixedCosts.trailerInsurance, 0)} className={cn(calculatedClass, !watchedValues.includeTrailer && "line-through")} readOnly/></Field>
                            <Field label="MRB" unit="€" disabled={!watchedValues.includeTruck}><Input value={formatCurrency(calculations.fixedCosts.mrb, 0)} className={cn(calculatedClass, !watchedValues.includeTruck && "line-through")} readOnly/></Field>
                            <Field label="Eurovignet" unit="€" disabled={!watchedValues.includeTruck}><Input value={formatCurrency(calculations.fixedCosts.eurovignette, 0)} className={cn(calculatedClass, !watchedValues.includeTruck && "line-through")} readOnly /></Field>
                            <Field label="Periodiek onderhoud" unit="€" disabled={!watchedValues.includeTruck}><Input value={formatCurrency(calculations.fixedCosts.periodicMaintenance, 0)} className={cn(calculatedClass, !watchedValues.includeTruck && "line-through")} readOnly /></Field>
                            <Field label="Reparatiekosten oplegger" unit="€" disabled={!watchedValues.includeTrailer}><Input value={formatCurrency(calculations.fixedCosts.trailerRepairCost, 0)} className={cn(calculatedClass, !watchedValues.includeTrailer && "line-through")} readOnly /></Field>
                            <Field label="Algemene kosten" unit="€"><Input value={formatCurrency(calculations.generalCosts.perVehicle, 0)} className={calculatedClass} readOnly /></Field>
                            <Field label="Leasekosten" unit="€"><Input value="-" className={calculatedClass} readOnly /></Field>
                            <Separator/>
                            <Field label="Totaal vaste kosten" unit="€"><Input value={formatCurrency(calculations.fixedCosts.total + calculations.generalCosts.perVehicle, 0)} className={cn(calculatedClass, "font-bold")} readOnly /></Field>
                        </Section>
                        <Section title="Overzicht Variabele Kosten (p/km)">
                             <Field label="Afschrijving banden" unit="€" disabled={!watchedValues.includeTruck}><Input value={formatCurrency(calculations.variableCosts.depreciationTiresPerKm, 4)} className={cn(calculatedClass, !watchedValues.includeTruck && "line-through")} readOnly/></Field>
                             <Field label="Afschrijving banden oplegger" unit="€" disabled={!watchedValues.includeTrailer}><Input value={formatCurrency(calculations.variableCosts.depreciationTrailerTiresPerKm, 4)} className={cn(calculatedClass, !watchedValues.includeTrailer && "line-through")} readOnly/></Field>
                             <Field label="Brandstofkosten" unit="€" disabled={!watchedValues.includeTruck}><Input value={formatCurrency(calculations.variableCosts.fuelCostPerKm, 4)} className={cn(calculatedClass, !watchedValues.includeTruck && "line-through")} readOnly/></Field>
                             <Field label="Olie en smeermiddelen" unit="€" disabled={!watchedValues.includeTruck}><Input value={formatCurrency(calculations.variableCosts.oilPerKm, 4)} className={cn(calculatedClass, !watchedValues.includeTruck && "line-through")} readOnly/></Field>
                             <Field label="Reparatiekosten" unit="€" disabled={!watchedValues.includeTruck}><Input value={formatCurrency(calculations.variableCosts.repairCostPerKm, 4)} className={cn(calculatedClass, !watchedValues.includeTruck && "line-through")} readOnly/></Field>
                             <Separator/>
                             <Field label="Totaal p/km" unit="€"><Input value={formatCurrency(calculations.variableCosts.totalPerKm, 4)} className={cn(calculatedClass, "font-bold")} readOnly/></Field>
                             <Field label="Jaarlijks" unit="€"><Input value={formatCurrency(calculations.variableCosts.yearlyTotal, 0)} className={calculatedClass} readOnly/></Field>
                        </Section>
                         <Section title="Loonkosten Berekening (p/j)">
                            <Field label="Basisloon (jaar)" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.yearlyBaseSalary, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Field label="Vakantiegeld" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.vacationAllowance, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Field label="Overuren 130%" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.yearlyOvertime130, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Field label="Overuren 150%" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.yearlyOvertime150, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Field label="19% Toeslag" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.yearlyShiftSurcharge, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Field label="Structurele Toeslag" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.yearlyStructuralSurcharge, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Field label="Ziektekosten" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.costSickDays, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Field label="Reiskostenvergoeding" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.travelAllowance, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Field label="Onbelaste Vergoedingen" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.dailyUnaxedAllowanceYearly, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly /></Field>
                            <Field label="Waarde vakantiedagen" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.totalValueOfVacationDays, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Separator/>
                            <Field label="Totaal Bruto loon" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.grossSalary, 0)} className={cn(calculatedClass, "font-bold", !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Field label={`Sociale lasten ${formatNumber(watchedValues.socialCharges, 1)}%`} disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.socialChargesAmount, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Field label={`Pensioen ${formatNumber(watchedValues.pension, 1)}%`} disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.pensionAmount, 0)} className={cn(calculatedClass, !watchedValues.includePersonnel && "line-through")} readOnly/></Field>
                            <Separator/>
                            <Field label="Totaal loonkosten" disabled={!watchedValues.includePersonnel}><Input value={formatCurrency(calculations.totalPersonnelCosts, 0)} className={cn(calculatedClass, "font-bold", !watchedValues.includePersonnel && "line-through")} readOnly /></Field>
                         </Section>
                         <Section title="Resultaat" className="bg-amber-100">
                             <div className="grid grid-cols-3 gap-2 items-center text-center font-bold px-2">
                                <Label></Label>
                                <Label>Gecombineerd (EN)</Label>
                                <Label>All-in (OF)</Label>
                            </div>
                            <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2 items-center">
                                    <Label>KM tarief</Label>
                                    <Input value={formatCurrency(calculations.tariffs.combinedKmRate)} className={calculatedClass} readOnly />
                                    <Input value={formatCurrency(calculations.tariffs.allInKmRate)} className={calculatedClass} readOnly />
                                </div>
                                <div className="grid grid-cols-3 gap-2 items-center">
                                    <Label>Uurtarief</Label>
                                    <Input value={formatCurrency(calculations.tariffs.combinedHourRate)} className={calculatedClass} readOnly />
                                    <Input value={formatCurrency(calculations.tariffs.allInHourRate)} className={calculatedClass} readOnly />
                                </div>
                            </div>
                             <CardHeader className="p-0 pb-2 mt-4 -mx-6 px-6">
                                <CardTitle className="text-base">Jaaromzet o.b.v. Tarief</CardTitle>
                            </CardHeader>
                            <div className="space-y-2">
                               <div className="grid grid-cols-3 gap-2 items-center">
                                    <Label>Totaal KM</Label>
                                    <Input value={formatCurrency(calculations.revenue.kmRevenue, 0)} className={calculatedClass} readOnly />
                                    <Input value={formatCurrency(calculations.revenue.totalAllInKm, 0)} className={calculatedClass} readOnly />
                                </div>
                                <div className="grid grid-cols-3 gap-2 items-center">
                                    <Label>Totaal Uur</Label>
                                    <Input value={formatCurrency(calculations.revenue.hourRevenue, 0)} className={calculatedClass} readOnly />
                                    <Input value={formatCurrency(calculations.revenue.totalAllInHour, 0)} className={calculatedClass} readOnly />
                                </div>
                                <div className="grid grid-cols-3 gap-2 items-center">
                                    <Label>Totaal Omzet</Label>
                                    <Input value={formatCurrency(calculations.revenue.totalCombined, 0)} className={cn(calculatedClass, "font-bold")} readOnly />
                                    <Input value={formatCurrency(calculations.revenue.totalCombined, 0)} className={cn(calculatedClass, "font-bold")} readOnly />
                                </div>
                            </div>
                        </Section>
                    </div>
                </div>
            </div>
          </Form>
        </FormProvider>
    );
}
