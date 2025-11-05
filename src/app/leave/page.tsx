
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, differenceInCalendarDays, getYear, parseISO, isWithinInterval, eachDayOfInterval, getDay, isSameDay, startOfDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Calendar as CalendarIcon, PlusCircle, Clock, CheckCircle, XCircle, X } from 'lucide-react';
// no Firestore usage on this page anymore
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';

import type { LeaveRequestFormData } from '@/lib/schemas';
import { leaveRequestSchema } from '@/lib/schemas';
import type { LeaveRequest, LeaveStatus, LeaveType } from '@/lib/types';
import { leaveStatusTranslations, leaveTypeTranslations, leaveTypes } from '@/lib/types';
import { holidays } from '@/lib/holidays';
import { useUserCollection } from '@/hooks/use-user-collection';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

async function sendAdminEmail(subject: string, body: string) {
  // Email sending is disabled
  return Promise.resolve();
}

const calculateWorkdays = (startDate: Date, endDate: Date): number => {
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    return days.filter(day => {
        const dayOfWeek = getDay(day);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = holidays.some(holiday => isSameDay(holiday.date, day));
        return !isWeekend && !isHoliday;
    }).length;
};


const getApprovedATVDaysForYear = async (userId: string, year: number): Promise<number> => {
    if (!userId) return 0;
    const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'atv')
        .eq('status', 'approved');
    if (error) return 0;
    let totalDays = 0;
    (data || []).forEach((row: any) => {
        const startDate = parseISO(row.start_date);
        const endDate = parseISO(row.end_date);
        if (getYear(startDate) === year) {
            totalDays += calculateWorkdays(startDate, endDate);
        }
    });
    return totalDays;
};


const StatusBadge = ({ status }: { status: LeaveStatus }) => {
    const variant: Record<LeaveStatus, "secondary" | "default" | "destructive"> = {
        pending: 'secondary',
        approved: 'default',
        rejected: 'destructive',
    };

    const icon: Record<LeaveStatus, React.ReactNode> = {
        pending: <Clock className="mr-1 h-3 w-3" />,
        approved: <CheckCircle className="mr-1 h-3 w-3" />,
        rejected: <XCircle className="mr-1 h-3 w-3" />,
    };

    return (
        <Badge variant={variant[status]} className="flex items-center w-fit">
            {icon[status]}
            {leaveStatusTranslations[status]}
        </Badge>
    );
};

export default function LeavePage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { documents: leaveRequests, loading, refresh: refreshLeaveRequests } = useUserCollection<LeaveRequest>('leaveRequests');

  const form = useForm<LeaveRequestFormData>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      type: 'vakantie',
      dateRange: { from: undefined, to: undefined },
      reason: '',
    },
  });

  const onSubmit = async (data: LeaveRequestFormData) => {
    if (!user || !data.dateRange.from || !data.dateRange.to) return;
    
    // ATV validation
    if (data.type === 'atv') {
        const currentYear = getYear(data.dateRange.from);
        const requestedDays = calculateWorkdays(data.dateRange.from, data.dateRange.to);
        const approvedDays = await getApprovedATVDaysForYear(user.uid!, currentYear);
        const totalATVDays = approvedDays + requestedDays;

        if (totalATVDays > 3.5) {
            toast({
                variant: "destructive",
                title: "ATV Limiet Overschreden",
                description: `U heeft al ${approvedDays} ATV-dagen opgenomen. Met deze aanvraag (${requestedDays} dagen) zou u op ${totalATVDays} dagen uitkomen. Het maximum is 3.5 dagen per jaar.`,
                duration: 9000
            });
            return;
        }
    }


    try {
        // Format dates as YYYY-MM-DD to avoid timezone issues
        // Use startOfDay to ensure we're working with midnight in local timezone
        const startDateStr = format(startOfDay(data.dateRange.from), 'yyyy-MM-dd');
        const endDateStr = format(startOfDay(data.dateRange.to), 'yyyy-MM-dd');
        
        const { error } = await supabase
          .from('leave_requests')
          .insert({
            user_id: user.uid,
            start_date: startDateStr,
            end_date: endDateStr,
            type: data.type,
            reason: data.reason,
            status: 'pending',
            submitted_at: new Date().toISOString(),
          });
        if (error) throw error;
        
        await sendAdminEmail(
            `Nieuwe verlofaanvraag van ${user.firstName}`,
            `Een nieuwe verlofaanvraag is ingediend van ${format(data.dateRange.from, 'PPP', { locale: nl })} tot ${format(data.dateRange.to, 'PPP', { locale: nl })}.`
        );

        toast({ title: 'Verlofaanvraag Ingediend' });
        setIsDialogOpen(false);
        form.reset();
        // Refresh leave requests immediately
        await refreshLeaveRequests();

    } catch (error) {
        console.error("Error submitting leave request:", error);
        toast({ variant: "destructive", title: "Indienen Mislukt" });
    }
  };
  
  const sortedLeaveRequests = [...leaveRequests].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  const handleWithdrawRequest = async (request: LeaveRequest) => {
    if (!user || request.status !== 'pending') return;

    try {
      const { error } = await supabase
        .from('leave_requests')
        .delete()
        .eq('id', request.id)
        .eq('user_id', user.uid); // Extra security check

      if (error) throw error;

      toast({ 
        title: 'Verlofaanvraag ingetrokken', 
        description: 'Uw verlofaanvraag is succesvol ingetrokken.' 
      });
      
      // Refresh to get updated list (this will automatically remove it from the UI)
      await refreshLeaveRequests();
    } catch (error) {
      console.error("Error withdrawing leave request:", error);
      toast({ 
        variant: "destructive", 
        title: "Intrekken Mislukt", 
        description: "De verlofaanvraag kon niet worden ingetrokken. Probeer het opnieuw." 
      });
    }
  };

  return (
    <div className="w-full max-w-[90%] mx-auto p-4 md:p-8 space-y-8">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-2xl font-bold">Mijn Verlofaanvragen</h1>
                <p className="text-muted-foreground">Dien nieuw verlof in en bekijk uw historie.</p>
            </div>
            <Button onClick={() => setIsDialogOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Nieuwe Aanvraag
            </Button>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Overzicht van {format(new Date(), 'yyyy')}</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Startdatum</TableHead>
                            <TableHead>Einddatum</TableHead>
                            <TableHead>Reden</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Acties</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({length: 3}).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                                    <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                                </TableRow>
                            ))
                        ) : sortedLeaveRequests.length > 0 ? (
                            sortedLeaveRequests.map(req => (
                                <TableRow key={req.id}>
                                    <TableCell>{leaveTypeTranslations[req.type]}</TableCell>
                                    <TableCell>{format(new Date(req.startDate), 'dd-MM-yyyy')}</TableCell>
                                    <TableCell>{format(new Date(req.endDate), 'dd-MM-yyyy')}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{req.reason}</TableCell>
                                    <TableCell><StatusBadge status={req.status} /></TableCell>
                                    <TableCell className="text-right">
                                        {req.status === 'pending' && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="outline" size="sm">
                                                        <X className="mr-2 h-4 w-4" /> Intrekken
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Verlofaanvraag intrekken</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Weet u zeker dat u deze verlofaanvraag van {format(new Date(req.startDate), 'dd-MM-yyyy')} tot {format(new Date(req.endDate), 'dd-MM-yyyy')} wilt intrekken? Deze actie kan niet ongedaan worden gemaakt.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleWithdrawRequest(req)}>
                                                            Intrekken
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center h-24">
                                    Geen verlofaanvragen gevonden.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Verlof aanvragen</DialogTitle>
            <DialogDescription>Selecteer de periode en het type verlof.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
               <FormField
                  control={form.control}
                  name="dateRange"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Periode</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="date"
                            variant={"outline"}
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value.from && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value.from ? (
                              field.value.to ? (
                                <>
                                  {format(field.value.from, "LLL dd, y")} -{" "}
                                  {format(field.value.to, "LLL dd, y")}
                                </>
                              ) : (
                                format(field.value.from, "LLL dd, y")
                              )
                            ) : (
                              <span>Kies een periode</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={field.value.from}
                            selected={field.value as any}
                            onSelect={field.onChange}
                            numberOfMonths={2}
                            locale={nl}
                          />
                        </PopoverContent>
                      </Popover>
                       <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Type Verlof</FormLabel>
                             <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecteer een type" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {leaveTypes.map(type => (
                                         <SelectItem key={type} value={type}>{leaveTypeTranslations[type]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reden (optioneel)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Bijv. vakantie, familiebezoek, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="secondary" disabled={form.formState.isSubmitting}>Annuleren</Button>
                </DialogClose>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'Bezig...' : 'Indienen'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
