
"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { LeaveRequest, LeaveStatus, LeaveType } from '@/lib/types';
import { leaveStatusTranslations, leaveTypeTranslations } from '@/lib/types';
import { holidays } from '@/lib/holidays';
import { eachDayOfInterval, getDay, isSameDay, parseISO } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CheckCircle, XCircle, MoreHorizontal, Calendar, Clock, FileText, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/use-auth';

async function sendEmail(to: string, subject: string, body: string) {
  // Email sending is disabled
  return Promise.resolve();
}

const rejectionSchema = z.object({
  reason: z.string().min(10, { message: 'Een reden voor afkeuring van minimaal 10 tekens is verplicht.' }),
});
type RejectionFormData = z.infer<typeof rejectionSchema>;

/**
 * Calculate leave hours for a leave request
 * - Each workday (Monday-Friday) = 8 hours
 * - Weekends (Saturday, Sunday) don't count
 * - Holidays don't count as leave hours
 */
const calculateLeaveHours = (startDate: string, endDate: string): number => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const days = eachDayOfInterval({ start, end });
    
    const workdays = days.filter(day => {
        const dayOfWeek = getDay(day);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
        const isHoliday = holidays.some(holiday => isSameDay(holiday.date, day));
        
        return !isWeekend && !isHoliday;
    });
    
    return workdays.length * 8; // 8 hours per workday
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

export default function AdminLeavePage() {
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRejectionDialogOpen, setIsRejectionDialogOpen] = useState(false);
    const [requestToReject, setRequestToReject] = useState<LeaveRequest | null>(null);
    const { toast } = useToast();
    const { user, isLoaded } = useAuth();
    
    const rejectionForm = useForm<RejectionFormData>({
        resolver: zodResolver(rejectionSchema),
        defaultValues: { reason: '' },
    });

    useEffect(() => {
        if (!isLoaded || user?.role !== 'admin') {
            if (isLoaded) setLoading(false);
            return;
        }

        let active = true;
        const fetchRequests = async () => {
            const { data, error } = await supabase
              .from('leave_requests')
              .select('*')
              .order('submitted_at', { ascending: false })
              .limit(50);
            if (!active) return;
            if (error) {
                console.error("Error fetching leave requests: ", error);
                toast({ variant: 'destructive', title: 'Fout bij ophalen', description: 'Kon verlofaanvragen niet laden.' });
                setLoading(false);
                return;
            }
            const rows = data || [];
            const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));
            let profilesMap = new Map<string, { first_name?: string, last_name?: string, email?: string }>();
            if (userIds.length > 0) {
                const { data: profs } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', userIds);
                (profs || []).forEach(p => profilesMap.set(p.id, { first_name: p.first_name, last_name: p.last_name, email: p.email }));
            }
            const mapped: LeaveRequest[] = rows.map(r => {
                const prof = profilesMap.get(r.user_id) || {};
                return {
                    id: r.id,
                    userId: r.user_id,
                    userFirstName: (prof.first_name as string) || '-',
                    userLastName: (prof.last_name as string) || '-',
                    userEmail: (prof.email as string) || '-',
                    startDate: r.start_date,
                    endDate: r.end_date,
                    type: r.type,
                    reason: r.reason || '',
                    status: r.status,
                    submittedAt: r.submitted_at,
                    rejectionReason: r.rejection_reason || undefined,
                } as LeaveRequest;
            });
            setLeaveRequests(mapped);
            setLoading(false);
        };
        fetchRequests();
        const ch = supabase.channel('admin-leave').on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, fetchRequests).subscribe();
        return () => { active = false; ch.unsubscribe(); };
    }, [toast, user, isLoaded]);

    const updateLeaveStatus = async (request: LeaveRequest, status: LeaveStatus, rejectionReason?: string) => {
        // Optimistic update: immediately update status in UI
        const previousStatus = request.status;
        const previousRejectionReason = request.rejectionReason;
        
        setLeaveRequests(prev => prev.map(req => 
            req.id === request.id 
                ? { ...req, status, rejectionReason: rejectionReason || undefined }
                : req
        ));

        try {
            const { error } = await supabase
              .from('leave_requests')
              .update({ status, rejection_reason: rejectionReason || null })
              .eq('id', request.id);
            if (error) throw error;
            
            const subject = `Update over je verlofaanvraag van ${format(new Date(request.startDate), 'dd-MM-yyyy')}`;
            const body = `Beste ${request.userFirstName},\n\nJe verlofaanvraag van ${format(new Date(request.startDate), 'dd-MM-yyyy')} tot ${format(new Date(request.endDate), 'dd-MM-yyyy')} is ${leaveStatusTranslations[status]}.${rejectionReason ? `\n\nReden: ${rejectionReason}` : ''}`;
            await sendEmail(request.userEmail, subject, body);

            toast({ title: `Aanvraag ${leaveStatusTranslations[status]}` });
        } catch (error) {
            console.error("Error updating status:", error);
            // Revert optimistic update on error
            setLeaveRequests(prev => prev.map(req => 
                req.id === request.id 
                    ? { ...req, status: previousStatus, rejectionReason: previousRejectionReason }
                    : req
            ));
            toast({ variant: "destructive", title: "Update Mislukt", description: "De status kon niet worden bijgewerkt. Probeer het opnieuw." });
        }
    };

    const openRejectionDialog = (request: LeaveRequest) => {
        setRequestToReject(request);
        rejectionForm.reset();
        setIsRejectionDialogOpen(true);
    };

    const handleRejectSubmit = async (data: RejectionFormData) => {
        if (!requestToReject) return;
        await updateLeaveStatus(requestToReject, 'rejected', data.reason);
        setIsRejectionDialogOpen(false);
        setRequestToReject(null);
    };

    const handleCancelLeave = async (request: LeaveRequest) => {
        // Optimistic update: immediately update status to pending
        const previousStatus = request.status;
        
        setLeaveRequests(prev => prev.map(req => 
            req.id === request.id 
                ? { ...req, status: 'pending' as LeaveStatus }
                : req
        ));

        try {
            const { error } = await supabase
              .from('leave_requests')
              .update({ status: 'pending' })
              .eq('id', request.id);
            if (error) throw error;
            
            const subject = `Verlofaanvraag geannuleerd`;
            const body = `Beste ${request.userFirstName},\n\nJe verlofaanvraag van ${format(new Date(request.startDate), 'dd-MM-yyyy')} tot ${format(new Date(request.endDate), 'dd-MM-yyyy')} is geannuleerd en teruggezet naar "In behandeling".`;
            await sendEmail(request.userEmail, subject, body);

            toast({ title: 'Verlof geannuleerd', description: 'De verlofaanvraag is teruggezet naar "In behandeling".' });
        } catch (error) {
            console.error("Error cancelling leave:", error);
            // Revert optimistic update on error
            setLeaveRequests(prev => prev.map(req => 
                req.id === request.id 
                    ? { ...req, status: previousStatus }
                    : req
            ));
            toast({ variant: "destructive", title: "Annuleren Mislukt", description: "Het verlof kon niet worden geannuleerd. Probeer het opnieuw." });
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Verlofbeheer</h1>
                    <p className="text-muted-foreground">Overzicht van alle ingediende verlofaanvragen.</p>
                </div>
            </div>
            <Card>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Medewerker</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Periode</TableHead>
                                <TableHead>Verlofuren</TableHead>
                                <TableHead>Reden</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Acties</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                        <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                                        <TableCell className="text-right"><Skeleton className="h-8 w-20" /></TableCell>
                                    </TableRow>
                                ))
                            ) : leaveRequests.length > 0 ? (
                                leaveRequests.map(req => {
                                    const leaveHours = calculateLeaveHours(req.startDate, req.endDate);
                                    return (
                                        <TableRow key={req.id}>
                                            <TableCell>{req.userFirstName} {req.userLastName}</TableCell>
                                            <TableCell>{leaveTypeTranslations[req.type]}</TableCell>
                                            <TableCell>{format(new Date(req.startDate), 'dd-MM-yy')} - {format(new Date(req.endDate), 'dd-MM-yy')}</TableCell>
                                            <TableCell>{leaveHours} uur</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{req.reason}</TableCell>
                                            <TableCell><StatusBadge status={req.status} /></TableCell>
                                            <TableCell className="text-right">
                                                {req.status === 'pending' && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => updateLeaveStatus(req, 'approved')}>
                                                                <CheckCircle className="mr-2 h-4 w-4" /> Goedkeuren
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => openRejectionDialog(req)}>
                                                                <XCircle className="mr-2 h-4 w-4" /> Afkeuren
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                                {req.status === 'approved' && (
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm"
                                                        onClick={() => handleCancelLeave(req)}
                                                    >
                                                        <X className="mr-2 h-4 w-4" /> Annuleren
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center h-24">Nog geen verlofaanvragen.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isRejectionDialogOpen} onOpenChange={setIsRejectionDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Aanvraag Afkeuren</DialogTitle>
                        <DialogDescription>Voer een duidelijke reden in waarom deze aanvraag wordt afgekeurd.</DialogDescription>
                    </DialogHeader>
                    <Form {...rejectionForm}>
                        <form onSubmit={rejectionForm.handleSubmit(handleRejectSubmit)} className="space-y-4">
                            <FormField
                                control={rejectionForm.control}
                                name="reason"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Reden van afkeuring</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Bijv. onderbezetting in deze periode..." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="secondary">Annuleren</Button></DialogClose>
                                <Button type="submit">Afkeuring bevestigen</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
