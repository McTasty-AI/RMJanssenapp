
"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useForm, FormProvider, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { weeklyLogSchema, type WeeklyLogFormData } from '@/lib/schemas';
import type { DailyLog, DayStatus, User, WeeklyLogStatus } from '@/lib/types';
type LicensePlate = string;
import { statusTranslations, tollOptions } from '@/lib/types';
import { useWeeklyLogs, calculateWorkHours } from '@/hooks/use-weekly-logs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as TFoot } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from '@/hooks/use-toast';
import { addWeeks, subWeeks, getISOWeek, getYear, format, startOfWeek, addDays, set, isBefore, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays, AlertCircle, Save, Truck, Send, Euro, Unlock, User as UserIcon, BedDouble, Hash, CheckCircle, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '../ui/checkbox';


const isWeekLockedByTime = (weekDate: Date): boolean => {
  const today = new Date();
  const startOfFormWeek = startOfWeek(weekDate, { weekStartsOn: 1 });
  // Lock date is next monday at 12:00
  const lockDate = set(addDays(startOfFormWeek, 7), { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 });
  return isBefore(lockDate, today);
};

const TimeInput = ({ name, disabled }: { name: string, disabled: boolean }) => {
    const { control } = useFormContext<WeeklyLogFormData>();
    return (
        <div className="flex gap-1">
            <FormField
                control={control}
                name={`${name}.hour` as any}
                render={({ field }) => (
                    <FormItem>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)} disabled={disabled}>
                            <FormControl>
                                <SelectTrigger className="w-[55px] h-9 text-xs">
                                    <SelectValue placeholder="UU" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {Array.from({ length: 25 }, (_, i) => i).map(h => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name={`${name}.minute` as any}
                render={({ field }) => (
                    <FormItem>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)} disabled={disabled}>
                            <FormControl>
                                <SelectTrigger className="w-[55px] h-9 text-xs">
                                    <SelectValue placeholder="MM" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {[0, 15, 30, 45].map(m => <SelectItem key={m} value={String(m)}>{String(m).padStart(2, '0')}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </FormItem>
                )}
            />
        </div>
    );
};


const BreakTimeInput = ({ name, disabled }: { name: string, disabled: boolean }) => {
    const { control, getValues, setValue } = useFormContext<WeeklyLogFormData>();
    const value = getValues(name as any) || { hour: 0, minute: 0 };
    const totalMinutes = value.hour * 60 + value.minute;

    const handleChange = (minutes: string) => {
        const numMinutes = parseInt(minutes, 10);
        setValue(name as any, { hour: Math.floor(numMinutes / 60), minute: numMinutes % 60 }, { shouldDirty: true, shouldValidate: true });
    };
    
    return (
        <FormField
            control={control}
            name={name as any}
            render={({ field }) => (
                <FormItem>
                     <Select onValueChange={handleChange} value={String(totalMinutes)} disabled={disabled}>
                        <FormControl>
                            <SelectTrigger className="w-full sm:w-[80px] h-9 text-xs">
                                <SelectValue placeholder="Min" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {[0, 15, 30, 45, 60, 75, 90].map(m => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}
                        </SelectContent>
                    </Select>
                </FormItem>
            )}
        />
    );
};

const MobileDayCard = ({ index, handlePlateChange, assignedPlates, formIsEditable }: { index: number, handlePlateChange: (index: number, plate: LicensePlate) => void, assignedPlates: LicensePlate[], formIsEditable: boolean }) => {
    const { control, watch, setValue, trigger, getValues } = useFormContext<WeeklyLogFormData>();
    const dayData = watch(`days.${index}`);
    const { date, day, status, startMileage, endMileage } = dayData;
    const isWorkDay = status === 'gewerkt';

    const workHours = calculateWorkHours(dayData);
    const totalKm = (endMileage ?? 0) - (startMileage ?? 0);
    
    const handleStatusChange = (newStatus: DayStatus) => {
        setValue(`days.${index}.status`, newStatus);
        if (newStatus !== 'gewerkt') {
            setValue(`days.${index}.startTime`, { hour: 0, minute: 0 });
            setValue(`days.${index}.endTime`, { hour: 0, minute: 0 });
            setValue(`days.${index}.breakTime`, { hour: 0, minute: 0 });
            setValue(`days.${index}.startMileage`, 0);
            setValue(`days.${index}.endMileage`, 0);
            setValue(`days.${index}.toll`, 'Geen');
            setValue(`days.${index}.overnightStay`, false);
            setValue(`days.${index}.tripNumber`, '');
        } else {
            // Find the last worked day before this one
            let lastMileage = 0;
            for (let i = index - 1; i >= 0; i--) {
                const prevDay = getValues(`days.${i}`);
                if (prevDay.status === 'gewerkt' && prevDay.endMileage) {
                    lastMileage = prevDay.endMileage;
                    break;
                }
            }
             setValue(`days.${index}.startMileage`, lastMileage, { shouldDirty: true });
        }
        trigger(`days.${index}`);
      };
      
    const handleEndMileageChange = (value: string | number) => {
        const numericValue = value === '' ? 0 : Number(value);
        setValue(`days.${index}.endMileage`, numericValue);
        
        // Find the next day that is a workday and update its start mileage
        for (let i = index + 1; i < 7; i++) {
            const nextDay = getValues(`days.${i}`);
            if (nextDay.status === 'gewerkt') {
                setValue(`days.${i}.startMileage`, numericValue, { shouldDirty: true });
                break; // Stop after updating the first next workday
            }
        }
    };

    return (
        <AccordionItem value={day} className="border-b-0">
             <Card className="mb-2">
                <AccordionTrigger className="p-4 hover:no-underline">
                    <div className="flex justify-between items-center w-full">
                        <div className="flex flex-col text-left">
                            <p className="font-bold capitalize">{day}</p>
                            <p className="font-normal text-muted-foreground text-xs">{format(new Date(date), 'dd-MM')}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className={cn("text-sm font-semibold", status !== 'gewerkt' && 'text-muted-foreground')}>
                                {statusTranslations[status]}
                            </span>
                            <span className="font-bold text-primary text-lg w-16 text-right">
                                {isWorkDay ? workHours.toFixed(2) : (status !== 'weekend' && status !== 'feestdag' ? '8.00' : '0.00')}
                            </span>
                        </div>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="p-4 pt-0">
                    <div className="space-y-4 pt-4 border-t">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={control}
                                name={`days.${index}.status`}
                                render={({ field: selectField }) => (
                                <FormItem>
                                    <FormLabel>Status</FormLabel>
                                    <Select 
                                        onValueChange={(value) => handleStatusChange(value as DayStatus)} 
                                        value={selectField.value} 
                                        disabled={!formIsEditable}
                                    >
                                    <FormControl>
                                        <SelectTrigger>
                                            <CalendarDays className="mr-2 h-4 w-4 opacity-50"/>
                                            <SelectValue placeholder="Selecteer status" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {Object.entries(statusTranslations).map(([key, value]) => (
                                        <SelectItem key={key} value={key}>{value}</SelectItem>
                                        ))}
                                    </SelectContent>
                                    </Select>
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={control}
                                name={`days.${index}.licensePlate`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Kenteken</FormLabel>
                                        <Select onValueChange={(plate) => handlePlateChange(index, plate as LicensePlate)} value={field.value ?? undefined} disabled={!isWorkDay || !formIsEditable || assignedPlates.length === 0}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <Truck className="mr-2 h-4 w-4 opacity-50"/>
                                                    <SelectValue placeholder="Kies kenteken" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {assignedPlates.map(plate => (
                                                    <SelectItem key={plate} value={plate}>{plate}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                        </div>
                         <FormField
                            control={control}
                            name={`days.${index}.tripNumber`}
                            render={({ field: inputField }) => (
                                <FormItem>
                                <FormLabel>Ritnummer</FormLabel>
                                <FormControl>
                                    <Input type="text" {...inputField} value={inputField.value || ''} disabled={!isWorkDay || !formIsEditable} placeholder="-" />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <FormItem>
                                <FormLabel>Begintijd</FormLabel>
                                <TimeInput name={`days.${index}.startTime`} disabled={!isWorkDay || !formIsEditable} />
                            </FormItem>
                            <FormItem>
                                <FormLabel>Eindtijd</FormLabel>
                                <TimeInput name={`days.${index}.endTime`} disabled={!isWorkDay || !formIsEditable} />
                            </FormItem>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={control}
                                name={`days.${index}.startMileage`}
                                render={({ field: inputField }) => (
                                    <FormItem>
                                    <FormLabel>Beginstand</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...inputField} onChange={e => inputField.onChange(e.target.value === '' ? '' : Number(e.target.value))} value={inputField.value || ''} disabled={!isWorkDay || !formIsEditable} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={control}
                                name={`days.${index}.endMileage`}
                                render={({ field: inputField }) => (
                                    <FormItem>
                                    <FormLabel>Eindstand</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...inputField} onChange={e => handleEndMileageChange(e.target.value)} value={inputField.value || ''} disabled={!isWorkDay || !formIsEditable} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                         <div className="grid grid-cols-2 gap-4">
                           <FormItem>
                               <FormLabel>Pauze</FormLabel>
                                <BreakTimeInput name={`days.${index}.breakTime`} disabled={!isWorkDay || !formIsEditable} />
                            </FormItem>
                             <FormItem>
                               <FormLabel>Totaal KM</FormLabel>
                                <Input value={totalKm > 0 ? totalKm.toFixed(2) : '0.00'} disabled className="font-medium" />
                            </FormItem>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={control}
                                name={`days.${index}.toll`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tol</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={!isWorkDay || !formIsEditable}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <Euro className="mr-2 h-4 w-4 opacity-50" />
                                                    <SelectValue placeholder="Selecteer tol" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {tollOptions.map((option) => (
                                                    <SelectItem key={option} value={option}>{option}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={control}
                                name={`days.${index}.overnightStay`}
                                render={({ field }) => (
                                <FormItem className="flex flex-col justify-end pb-1">
                                    <div className='flex items-center space-x-2 h-10'>
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                                disabled={!isWorkDay || !formIsEditable}
                                            />
                                        </FormControl>
                                        <label
                                            htmlFor="overnightStay"
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                            >
                                            Overnachting
                                        </label>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </div>
                    </div>
                </AccordionContent>
             </Card>
        </AccordionItem>
    );
};


export function WeeklyLogForm({
  weekData,
  onSave,
  currentUser,
  onWeekChange,
}: {
  weekData: WeeklyLogFormData;
  onSave: (data: WeeklyLogFormData, newStatus: WeeklyLogStatus) => Promise<void>;
  currentUser: User;
  onWeekChange: (direction: 'next' | 'prev') => void;
}) {
  const form = useForm<WeeklyLogFormData>({
    resolver: zodResolver(weeklyLogSchema),
    defaultValues: weekData
  });
  
  const { control, getValues, watch, trigger, setValue, reset, formState: { isDirty, isSubmitting } } = form;
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const assignedPlates = currentUser?.assignedLicensePlates || [];
  
  const watchedValues = watch();
  
  // Ref to track if we're currently saving to prevent multiple simultaneous saves
  const isSavingRef = useRef(false);
  // Ref to track the debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // State to track if form is being submitted
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  
  // Calculate lock status early so it can be used in handleSubmitAndSend
  const weekIsLockedByStatus = weekData.status === 'pending' || weekData.status === 'approved' || isSubmittingForm;
  const weekIsLockedByDate = useMemo(() => {
    if (!weekData || !weekData.days || !weekData.days[0]) return false;
    return isWeekLockedByTime(new Date(weekData.days[0].date));
  }, [weekData]);
  
  const formIsEditable = !weekIsLockedByStatus;
  const canSubmit = useMemo(() => assignedPlates.length > 0, [assignedPlates]);

  const handleAutoSave = useCallback(async () => {
      // Prevent multiple simultaneous saves
      if (isSavingRef.current || !isDirty || !weekData) return;
      
      isSavingRef.current = true;
      try {
          const data = getValues();
          await onSave(data, 'concept');
      } finally {
          isSavingRef.current = false;
      }
  }, [onSave, getValues, isDirty, weekData]);

  useEffect(() => {
    // Only auto-save if form is dirty
    if (!isDirty || !weekData) {
        // Clear timer if form is not dirty
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        return;
    }

    // Clear existing timer if user makes another change
    if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
    }

    // Debounce: wait 5 seconds after last change before saving
    debounceTimerRef.current = setTimeout(() => {
        handleAutoSave();
        debounceTimerRef.current = null;
    }, 5000); 

    return () => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
    };
  }, [watchedValues, isDirty, handleAutoSave, weekData]);

  const handleManualSave = async () => {
    const data = getValues();
    await onSave(data, data.status); // Save with current status
    
    toast({
        title: "Opgeslagen",
        description: "De wijzigingen zijn succesvol opgeslagen.",
    });
    reset(getValues()); // Resets the dirty state
  }

  const handleSubmitAndSend = async () => {
    if (!canSubmit) {
      toast({
        variant: "destructive",
        title: "Geen kenteken toegewezen",
        description: "U kunt geen weekstaat indienen omdat er geen kenteken aan uw account is gekoppeld.",
      });
      return;
    }
    
    // Prevent double submission
    if (isSubmittingForm || weekIsLockedByStatus) {
      return;
    }
    
    const isFormValid = await trigger();
    if (!isFormValid) {
      toast({
        variant: "destructive",
        title: "Formulier niet compleet",
        description: "Controleer de ingevoerde gegevens. Alle verplichte velden (gemarkeerd in rood) voor werkdagen moeten ingevuld zijn.",
      });
      return;
    }
    
    // Disable form immediately
    setIsSubmittingForm(true);
    
    // Cancel any pending auto-save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    
    try {
      const data = getValues();
      await onSave(data, 'pending');
      
      toast({
          title: "Weekstaat Ingediend",
          description: "De weekstaat is succesvol ingediend en wacht op goedkeuring. Wijzigingen zijn niet meer mogelijk.",
      });

      const updatedData = { ...getValues(), status: 'pending' as WeeklyLogStatus };
      reset(updatedData); // Reset dirty state and update status in form
    } catch (error) {
      // Re-enable form if save failed
      setIsSubmittingForm(false);
      toast({
        variant: "destructive",
        title: "Fout bij indienen",
        description: "Er is een fout opgetreden bij het indienen van de weekstaat. Probeer het opnieuw.",
      });
    }
  }

  useEffect(() => {
     if(weekData) {
        reset(weekData);
     }
  }, [weekData, reset]);
  
  const totals = useMemo(() => {
    const days = watchedValues.days || [];
    return days.reduce(
      (acc, day) => {
        let dailyHours = 0;
        if (!day) return acc;
        switch(day.status) {
            case 'gewerkt':
                dailyHours = calculateWorkHours(day);
                acc.kilometers += (day.endMileage ?? 0) - (day.startMileage ?? 0);
                break;
            case 'ziek':
            case 'vrij':
            case 'atv':
            case 'ouderschapsverlof':
                dailyHours = 8;
                break;
        }
        acc.hours += dailyHours;
        return acc;
      },
      { hours: 0, kilometers: 0 }
    );
  }, [watchedValues]);

  const progressValue = useMemo(() => Math.min((totals.hours / 40) * 100, 100), [totals.hours]);

  const handleStatusChange = (index: number, newStatus: DayStatus) => {
    setValue(`days.${index}.status`, newStatus);
    if (newStatus !== 'gewerkt') {
        setValue(`days.${index}.startTime`, { hour: 0, minute: 0 });
        setValue(`days.${index}.endTime`, { hour: 0, minute: 0 });
        setValue(`days.${index}.breakTime`, { hour: 0, minute: 0 });
        setValue(`days.${index}.startMileage`, 0);
        setValue(`days.${index}.endMileage`, 0);
        setValue(`days.${index}.toll`, 'Geen');
        setValue(`days.${index}.overnightStay`, false);
        setValue(`days.${index}.tripNumber`, '');
    } else {
        // Find the last worked day before this one
        let lastMileage = 0;
        for (let i = index - 1; i >= 0; i--) {
            const prevDay = getValues(`days.${i}`);
            if (prevDay.status === 'gewerkt' && prevDay.endMileage) {
                lastMileage = prevDay.endMileage;
                break;
            }
        }
        setValue(`days.${index}.startMileage`, lastMileage, { shouldDirty: true });
    }
    trigger(`days.${index}`);
  };

  const handlePlateChange = (index: number, plate: LicensePlate) => {
    setValue(`days.${index}.licensePlate`, plate, { shouldValidate: true, shouldDirty: true });
    
    for (let i = index + 1; i < 7; i++) {
        const currentPlate = getValues(`days.${i}.licensePlate`);
        const currentStatus = getValues(`days.${i}.status`);
        if (!currentPlate && currentStatus !== 'weekend' && currentStatus !== 'feestdag') {
             setValue(`days.${i}.licensePlate`, plate, { shouldDirty: true });
        }
    }
  };

  const getSubmitButton = () => {
    const status = weekData.status;

    if (status === 'approved') {
        return (
            <Button disabled variant="success" className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="mr-2 h-4 w-4" />
                Goedgekeurd
            </Button>
        );
    }
    
    if (status === 'pending' || isSubmittingForm) {
        return (
            <Button disabled>
                <CheckCircle className="mr-2 h-4 w-4" />
                {isSubmittingForm ? 'Bezig met indienen...' : 'Ingediend'}
            </Button>
        );
    }

    return (
        <Button type="button" onClick={handleSubmitAndSend} disabled={!formIsEditable || !canSubmit || isSubmitting || isSubmittingForm}>
          {isSubmittingForm ? 'Bezig...' : (
            <>
              <Send className="mr-2 h-4 w-4" />
              {weekData.submitted ? 'Opnieuw Indienen' : 'Weekstaat Indienen'}
            </>
          )}
      </Button>
    )
  }

  const handleEndMileageChange = (index: number, value: string | number) => {
    const numericValue = value === '' ? 0 : Number(value);
    setValue(`days.${index}.endMileage`, numericValue);

    // Find the next day that is a workday and update its start mileage
    for (let i = index + 1; i < 7; i++) {
        const nextDay = getValues(`days.${i}`);
        if (nextDay.status === 'gewerkt') {
            setValue(`days.${i}.startMileage`, numericValue, { shouldDirty: true });
            break; // Stop after updating the first next workday
        }
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
        <Card>
          <CardHeader>
             <div className="flex justify-between items-center">
                 <Button variant="ghost" size="icon" onClick={() => onWeekChange('prev')}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className='text-center'>
                    <CardTitle className="font-headline">
                        Week {getISOWeek(startOfWeek(new Date(weekData.days[0].date), {weekStartsOn: 1}))} ({getYear(startOfWeek(new Date(weekData.days[0].date), {weekStartsOn: 1}))})
                    </CardTitle>
                    <p className="text-sm font-normal text-muted-foreground">
                        {format(startOfWeek(new Date(weekData.days[0].date), {weekStartsOn:1}), 'd MMM', {locale: nl})} - {format(addDays(startOfWeek(new Date(weekData.days[0].date), {weekStartsOn:1}), 6), 'd MMM yyyy', {locale: nl})}
                    </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onWeekChange('next')}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
          </CardHeader>
          <CardContent>
            {weekData.status === 'pending' && (
                <Alert variant="default" className="mb-4 border-blue-500 text-blue-700 [&>svg]:text-blue-700">
                    <Clock className="h-4 w-4" />
                    <AlertTitle>Weekstaat in behandeling</AlertTitle>
                    <AlertDescription>
                        Deze weekstaat is ingediend en wacht op goedkeuring door een beheerder. U kunt geen wijzigingen meer maken.
                    </AlertDescription>
                </Alert>
            )}
             {weekData.status === 'approved' && (
                <Alert variant="default" className="mb-4 border-green-500 text-green-700 [&>svg]:text-green-700">
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>Weekstaat goedgekeurd</AlertTitle>
                    <AlertDescription>
                        Deze weekstaat is goedgekeurd. Wijzigingen zijn niet meer mogelijk.
                    </AlertDescription>
                </Alert>
            )}
            {weekIsLockedByDate && weekData.status === 'concept' && (
                <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Weekstaat vergrendeld</AlertTitle>
                    <AlertDescription>
                        De deadline voor het indienen van deze week is verstreken. Wijzigingen zijn niet meer mogelijk.
                    </AlertDescription>
                </Alert>
            )}
            {!canSubmit && (
                 <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Geen kenteken toegewezen</AlertTitle>
                    <AlertDescription>
                        Er zijn geen kentekens aan uw account gekoppeld. Een admin moet dit eerst instellen via gebruikersbeheer.
                    </AlertDescription>
                </Alert>
            )}
            <div className="space-y-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1 space-y-4">
                       <div>
                            <div className="flex justify-between items-center mb-1 text-sm mt-2">
                                <p className="font-medium text-muted-foreground">Wekelijkse voortgang</p>
                                <p className="font-bold text-primary">{totals.hours.toFixed(2)} / 40 uur</p>
                            </div>
                            <Progress 
                            value={progressValue} 
                            className="w-full"
                            variant={totals.hours < 40 ? "destructive" : "default"}
                            />
                       </div>
                    </div>
                    <div className="md:col-span-2">
                         <FormField
                            control={control}
                            name="remarks"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Algemene opmerkingen</FormLabel>
                                    <FormControl>
                                        <Textarea
                                        placeholder="Voeg hier algemene opmerkingen voor de hele week toe..."
                                        className="resize-none"
                                        {...field}
                                        disabled={!formIsEditable}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>
            </div>

            {isMobile ? (
                <Accordion type="multiple" className="w-full">
                    {(watch('days') || []).map((dayData, index) => (
                         <MobileDayCard key={dayData.date} index={index} handlePlateChange={handlePlateChange} assignedPlates={assignedPlates} formIsEditable={formIsEditable} />
                    ))}
                </Accordion>
            ) : (
                <div className="overflow-x-auto -mx-4 px-4">
                    <Table className="min-w-full">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px] min-w-[100px] px-2 text-xs">Dag</TableHead>
                                <TableHead className="w-[120px] min-w-[120px] px-2 text-xs">Status</TableHead>
                                <TableHead className="w-[120px] min-w-[120px] px-2 text-xs">Kenteken</TableHead>
                                <TableHead className="w-[65px] min-w-[65px] px-2 text-xs">Ritnr</TableHead>
                                <TableHead className="w-[95px] min-w-[95px] px-2 text-xs">Start</TableHead>
                                <TableHead className="w-[95px] min-w-[95px] px-2 text-xs">Eind</TableHead>
                                <TableHead className="w-[75px] min-w-[75px] px-2 text-xs">Pauze</TableHead>
                                <TableHead className="w-[70px] min-w-[70px] px-2 text-xs">Uren</TableHead>
                                <TableHead className="w-[85px] min-w-[85px] px-2 text-xs">Beginstand</TableHead>
                                <TableHead className="w-[85px] min-w-[85px] px-2 text-xs">Eindstand</TableHead>
                                <TableHead className="w-[85px] min-w-[85px] px-2 text-xs">Totaal KM</TableHead>
                                <TableHead className="w-[80px] min-w-[80px] px-2 text-xs">Tol</TableHead>
                                <TableHead className="w-[100px] min-w-[100px] px-2 text-xs">Overnachting</TableHead>
                            </TableRow>
                        </TableHeader>
                    <TableBody>
                {(watch('days') || []).map((dayData, index) => {
                    if (!dayData) return null;
                    const status = dayData.status;
                    const isWorkDay = status === 'gewerkt';
                    const workHours = calculateWorkHours(dayData);
                    const totalKm = (dayData.endMileage ?? 0) - (dayData.startMileage ?? 0);

                    return (
                    <TableRow key={dayData.date}>
                        <TableCell className="font-medium capitalize px-2 text-xs">
                            <div>{dayData.day}</div>
                            <div className="text-muted-foreground font-normal text-[10px]">{format(parseISO(dayData.date), 'dd-MM')}</div>
                        </TableCell>
                        <TableCell className="px-2">
                        <FormField
                            control={control}
                            name={`days.${index}.status`}
                            render={({ field: selectField }) => (
                            <Select 
                                onValueChange={(value) => handleStatusChange(index, value as DayStatus)} 
                                value={selectField.value} 
                                disabled={!formIsEditable}
                            >
                                <FormControl>
                                <SelectTrigger className="h-9 text-xs">
                                    <CalendarDays className="mr-2 h-3 w-3 opacity-50"/>
                                    <SelectValue placeholder="Selecteer status" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                {Object.entries(statusTranslations).map(([key, value]) => (
                                    <SelectItem key={key} value={key}>{value}</SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                            )}
                        />
                        </TableCell>
                        <TableCell className="px-2">
                            <FormField
                                control={control}
                                name={`days.${index}.licensePlate`}
                                render={({ field }) => (
                                    <FormItem>
                                        <Select 
                                            onValueChange={(plate) => handlePlateChange(index, plate as LicensePlate)}
                                            value={field.value ?? undefined} 
                                            disabled={!isWorkDay || !formIsEditable || assignedPlates.length === 0}
                                        >
                                            <FormControl>
                                            <SelectTrigger className="h-9 text-xs">
                                                <Truck className="mr-2 h-3 w-3 opacity-50"/>
                                                <SelectValue placeholder="Kies kenteken" />
                                            </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                            {assignedPlates.map(plate => (
                                                <SelectItem key={plate} value={plate}>{plate}</SelectItem>
                                            ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                                />
                        </TableCell>
                        <TableCell className="px-2">
                             <FormField
                                control={control}
                                name={`days.${index}.tripNumber`}
                                render={({ field: inputField }) => (
                                    <FormItem>
                                    <FormControl>
                                        <Input type="text" {...inputField} value={inputField.value || ''} disabled={!isWorkDay || !formIsEditable} className="w-full max-w-[65px] h-9 text-xs" />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </TableCell>
                        <TableCell className="px-2"><TimeInput name={`days.${index}.startTime`} disabled={!isWorkDay || !formIsEditable} /></TableCell>
                        <TableCell className="px-2"><TimeInput name={`days.${index}.endTime`} disabled={!isWorkDay || !formIsEditable} /></TableCell>
                        <TableCell className="px-2"><BreakTimeInput name={`days.${index}.breakTime`} disabled={!isWorkDay || !formIsEditable} /></TableCell>
                        <TableCell className="font-medium px-2 text-xs">
                            {isWorkDay ? workHours.toFixed(2) : (!['gewerkt', 'weekend', 'feestdag'].includes(status as any) ? '8.00' : '0.00')}
                        </TableCell>
                        <TableCell className="px-2">
                            <FormField
                                control={control}
                                name={`days.${index}.startMileage`}
                                render={({ field: inputField, fieldState }) => (
                                    <FormItem>
                                    <FormControl>
                                        <Input type="number" {...inputField} onChange={e => inputField.onChange(e.target.value === '' ? '' : Number(e.target.value))} value={inputField.value || ''} disabled={!isWorkDay || !formIsEditable} className="w-full max-w-[85px] h-9 text-xs" />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </TableCell>
                        <TableCell className="px-2">
                            <FormField
                                control={control}
                                name={`days.${index}.endMileage`}
                                render={({ field: inputField, fieldState }) => (
                                    <FormItem>
                                    <FormControl>
                                        <Input type="number" {...inputField} onChange={e => handleEndMileageChange(index, e.target.value)} value={inputField.value || ''} disabled={!isWorkDay || !formIsEditable} className="w-full max-w-[85px] h-9 text-xs" />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </TableCell>
                         <TableCell className="font-medium px-2 text-xs">{totalKm > 0 ? totalKm.toFixed(2) : '0.00'}</TableCell>
                        <TableCell className="px-2">
                            <FormField
                                control={control}
                                name={`days.${index}.toll`}
                                render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value} disabled={!isWorkDay || !formIsEditable}>
                                        <FormControl>
                                            <SelectTrigger className="h-9 text-xs">
                                                <SelectValue placeholder="Selecteer tol" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {tollOptions.map((option) => (
                                                <SelectItem key={option} value={option}>{option}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </TableCell>
                        <TableCell className="px-2">
                            <FormField
                                control={control}
                                name={`days.${index}.overnightStay`}
                                render={({ field }) => (
                                <FormItem className="flex items-center justify-center">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            disabled={!isWorkDay || !formIsEditable}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                        </TableCell>
                    </TableRow>
                    );
                })}
                </TableBody>
                <TFoot>
                    <TableRow>
                        <TableCell colSpan={7} className="font-bold text-right px-2 text-xs">Totaal</TableCell>
                        <TableCell className="font-bold px-2 text-xs">{totals.hours.toFixed(2)}</TableCell>
                        <TableCell colSpan={2}></TableCell>
                        <TableCell className="font-bold px-2 text-xs">{totals.kilometers ? totals.kilometers.toFixed(2).replace('.', ',') : '0,00'} km</TableCell>
                        <TableCell colSpan={2}></TableCell>
                    </TableRow>
                </TFoot>
                    </Table>
                </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
               <Button variant="outline" onClick={handleManualSave} disabled={!formIsEditable || isSubmitting}>
                  <Save className="mr-2 h-4 w-4" />
                  Opslaan
              </Button>
              {getSubmitButton()}
          </CardFooter>
        </Card>
      </form>
    </FormProvider>
  );
}

export default function WeeklyLog({ selectedDate, onDateChange }: { selectedDate: Date, onDateChange: (date: Date) => void }) {
  const { user, isLoaded: authIsLoaded } = useAuth();
  const { saveLog, isLoaded, weekData } = useWeeklyLogs(selectedDate);

  const handleSave = useCallback(async (data: WeeklyLogFormData, newStatus: WeeklyLogStatus) => {
    if(!user || !weekData) return;
    await saveLog(data, newStatus);
  }, [saveLog, user, weekData]);

  const handleWeekChange = (direction: 'next' | 'prev') => {
    // Always navigate using week start to ensure correct week numbers
    const currentWeekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const newWeekStart = direction === 'next' ? addWeeks(currentWeekStart, 1) : subWeeks(currentWeekStart, 1);
    onDateChange(newWeekStart);
  }

  const showSkeleton = !isLoaded || !authIsLoaded || !user || !weekData;
  
  if (showSkeleton) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
             <div className="flex justify-between items-center">
                <Skeleton className="h-10 w-10" />
                <div className="text-center space-y-1">
                    <Skeleton className="h-7 w-48 mx-auto" />
                    <Skeleton className="h-4 w-32 mx-auto" />
                </div>
                <Skeleton className="h-10 w-10" />
             </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 p-6">
                <Skeleton className="h-10 w-1/3" />
                <Skeleton className="h-20 w-full" />
            </div>
            <Skeleton className="h-96 w-full" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-10 w-32 ml-auto" />
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <WeeklyLogForm 
        key={`${weekData.weekId}-${weekData.status}-${user?.assignedLicensePlates?.join('-')}`}
        weekData={weekData}
        onSave={handleSave}
        currentUser={user}
        onWeekChange={handleWeekChange}
      />
    </div>
  );
}
