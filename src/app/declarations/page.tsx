
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth, isSameDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Calendar as CalendarIcon, UploadCloud, FileText, CheckCircle, XCircle, ChevronLeft, ChevronRight, PlusCircle, Circle, Loader2 } from 'lucide-react';
import type { DayContentProps } from 'react-day-picker';
import { useAuth } from '@/hooks/use-auth';

import type { DeclarationFormData } from '@/lib/schemas';
import { declarationSchema } from '@/lib/schemas';
import type { Declaration, DeclarationStatus } from '@/lib/types';
import { declarationStatusTranslations } from '@/lib/types';
import { useUserCollection } from '@/hooks/use-user-collection';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase/client';
import DebugConsole from '@/components/DebugConsole';
import { createDeclaration } from '@/lib/data/declarations';


const StatusBadge = ({ status }: { status: DeclarationStatus }) => {
    const variant = {
        pending: 'secondary',
        approved: 'default',
        rejected: 'destructive',
        paid: 'success'
    }[status];

    const icon = {
        pending: <FileText className="mr-1 h-3 w-3" />,
        approved: <CheckCircle className="mr-1 h-3 w-3" />,
        rejected: <XCircle className="mr-1 h-3 w-3" />,
        paid: <CheckCircle className="mr-1 h-3 w-3" />, // TODO: Better icon
    }[status];

    return (
        <Badge variant={variant as any} className="flex items-center w-fit">
            {icon}
            {declarationStatusTranslations[status]}
        </Badge>
    );
};


export default function DeclarationsPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { user, authUser } = useAuth();
  const { toast } = useToast();
  const { documents: allDeclarations, loading, refresh: refreshDeclarations } = useUserCollection<Declaration>('declarations');

  const monthlyDeclarations = useMemo(() => {
    return allDeclarations
      .filter(dec => isSameMonth(new Date(dec.date), currentMonth))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allDeclarations, currentMonth]);

 const declarationStatusByDate = useMemo(() => {
    const statusMap: { [key: string]: DeclarationStatus } = {};
    const statusPriority: Record<DeclarationStatus, number> = {
        rejected: 3,
        pending: 2,
        approved: 1,
        paid: 0,
    };

    monthlyDeclarations.forEach(dec => {
        const dateString = format(new Date(dec.date), 'yyyy-MM-dd');
        if (!statusMap[dateString] || statusPriority[dec.status] > statusPriority[statusMap[dateString]]) {
            statusMap[dateString] = dec.status;
        }
    });
    return statusMap;
  }, [monthlyDeclarations]);


  const form = useForm<DeclarationFormData>({
    resolver: zodResolver(declarationSchema),
    defaultValues: {
      amount: 0,
      reason: '',
      receipt: undefined,
      date: new Date(),
      isToll: false,
    },
  });

  const handleOpenDialog = (date?: Date) => {
    const dialogDate = date || new Date();
    setSelectedDate(dialogDate);
    form.reset({
        amount: 0,
        reason: '',
        receipt: undefined,
        date: dialogDate,
        isToll: false,
    });
    setIsDialogOpen(true);
  };
  
  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setSelectedDate(undefined);
  }

  const onSubmit = async (data: DeclarationFormData) => {
    if (!user || !authUser) {
      toast({ variant: 'destructive', title: 'Niet ingelogd' });
      return;
    }
    if (!data.receipt || data.receipt.length === 0) {
        toast({ variant: 'destructive', title: 'Geen bestand', description: 'Selecteer een bonnetje om te uploaden.' });
        return;
    }

    setIsSubmitting(true);
    const receiptFile = data.receipt[0];

    try {
        await createDeclaration({
          date: format(data.date, 'yyyy-MM-dd'),
          amount: data.amount,
          reason: data.reason,
          is_toll: data.isToll || false,
          file: receiptFile,
        });

        toast({
          title: 'Declaratie Ingediend',
          description: 'Uw declaratie is succesvol ingediend en wacht op goedkeuring.',
        });
        handleDialogClose();
        // Refresh declarations immediately
        await refreshDeclarations();
    } catch (error: any) {
        console.error("[onSubmit] CRITICAL ERROR during submission:", error);
        toast({
            variant: "destructive",
            title: "Indienen Mislukt",
            description: error.message || 'Er is een onverwachte fout opgetreden.',
            duration: 9000
        });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const DayWithDot = useCallback((props: DayContentProps) => {
    const { date, displayMonth } = props;
    const dateString = format(date, 'yyyy-MM-dd');
    const status = declarationStatusByDate[dateString];

    let dotColorClass = '';
    if (status) {
        switch (status) {
            case 'approved':
            case 'paid':
                dotColorClass = 'bg-green-500';
                break;
            case 'pending':
                dotColorClass = 'bg-orange-500';
                break;
            case 'rejected':
                dotColorClass = 'bg-red-500';
                break;
        }
    }

    // Render default day content if the day is outside the current month
    if (date.getMonth() !== displayMonth.getMonth()) {
        return <div className="p-2.5 text-muted-foreground opacity-50">{format(date, 'd')}</div>;
    }

    return (
      <div className="relative h-full w-full flex items-center justify-center p-2.5">
        <span>{format(date, 'd')}</span>
        {status && <div className={cn("absolute top-1.5 right-1.5 h-2 w-2 rounded-full", dotColorClass)} />}
      </div>
    );
  }, [declarationStatusByDate]);

  return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-3xl font-bold">Mijn Declaraties</h1>
                <p className="text-muted-foreground">Dien nieuwe declaraties in en beheer uw overzicht.</p>
            </div>
            <Button onClick={() => handleOpenDialog()}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Nieuwe Declaratie
            </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
                <Card>
                    <CardContent className="p-2 flex flex-col">
                       <Calendar
                            mode="single"
                            onSelect={(day) => {
                              if (day) {
                                  setSelectedDate(day);
                                  handleOpenDialog(day);
                              } else {
                                  setSelectedDate(undefined);
                              }
                            }}
                            month={currentMonth}
                            onMonthChange={setCurrentMonth}
                            className="rounded-md"
                            locale={nl}
                            components={{ DayContent: DayWithDot }}
                            modifiersClassNames={{
                                selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                            }}
                        />
                         <div className="flex justify-center items-center gap-4 p-2 border-t mt-2">
                            <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-orange-500" /> <span className="text-xs">Ingediend</span></div>
                            <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-green-500" /> <span className="text-xs">Goedgekeurd</span></div>
                            <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-red-500" /> <span className="text-xs">Afgekeurd</span></div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="lg:col-span-2">
                 <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div className="flex-1">
                                <CardTitle>Overzicht voor <span className="text-primary capitalize">{format(currentMonth, 'LLLL yyyy', { locale: nl })}</span></CardTitle>
                            </div>
                             <div className="flex items-center gap-2 justify-end flex-1">
                                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Datum</TableHead>
                                    <TableHead>Bedrag</TableHead>
                                    <TableHead>Reden</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Bonnetje</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({length: 3}).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                            <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : monthlyDeclarations.length > 0 ? (
                                    monthlyDeclarations.map(dec => (
                                        <TableRow key={dec.id}>
                                            <TableCell>{format(new Date(dec.date), 'dd-MM-yyyy')}</TableCell>
                                            <TableCell>€ {dec.amount.toFixed(2)}</TableCell>
                                            <TableCell>{dec.reason}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <StatusBadge status={dec.status} />
                                                    {dec.status === 'rejected' && dec.rejectionReason && (
                                                        <div className="text-xs text-destructive mt-1 p-2 bg-destructive/10 rounded-md">
                                                            <strong>Afwijzingsreden:</strong> {dec.rejectionReason}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" asChild>
                                                    <a href={dec.receiptUrl} target="_blank" rel="noopener noreferrer">Bekijk</a>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center h-24">
                                            Geen declaraties gevonden voor deze maand.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
      
      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
         <DialogContent className="sm:max-w-[425px]">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <DialogHeader>
                    <DialogTitle>Declaratie indienen</DialogTitle>
                    <DialogDescription>
                      Vul de onderstaande gegevens in om een nieuwe declaratie in te dienen.
                    </DialogDescription>
                  </DialogHeader>
                   <div className="space-y-4 py-4">
                       <FormField
                          control={form.control}
                          name="date"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Datum van declaratie</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant={"outline"}
                                      className={cn(
                                        "w-full pl-3 text-left font-normal",
                                        !field.value && "text-muted-foreground"
                                      )}
                                    >
                                      {field.value ? (
                                        format(field.value, 'PPP', { locale: nl })
                                      ) : (
                                        <span>Kies een datum</span>
                                      )}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) =>
                                      date > new Date() || date < new Date("2020-01-01")
                                    }
                                    initialFocus
                                  />
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
                              <Input type="number" step="0.01" placeholder="25,50" {...field} onChange={e => field.onChange(Number(e.target.value))}/>
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
                            <FormLabel>Reden</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Bijv. parkeerkosten, lunch, etc." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="receipt"
                        render={({ field: { onChange, value, ...rest } }) => (
                         <FormItem>
                            <FormLabel>Bonnetje/Factuur</FormLabel>
                            <FormControl>
                                <div className="relative">
                                    <Input 
                                        type="file"
                                        accept="image/*,.pdf" 
                                        className="pl-12"
                                        onChange={(e) => onChange(e.target.files)}
                                    />
                                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                       <UploadCloud className="h-5 w-5 text-gray-400" />
                                    </div>
                                </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="isToll"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel>
                                        Dit betreft een tol-declaratie
                                    </FormLabel>
                                </div>
                            </FormItem>
                        )}
                      />
                   </div>
                  <DialogFooter>
                     <DialogClose asChild>
                        <Button type="button" variant="secondary" disabled={isSubmitting}>Annuleren</Button>
                    </DialogClose>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Bezig...
                          </>
                        ) : 'Indienen'}
                    </Button>
                  </DialogFooter>
              </form>
            </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
