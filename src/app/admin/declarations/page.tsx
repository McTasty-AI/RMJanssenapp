
"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Declaration, DeclarationStatus } from '@/lib/types';
import { declarationStatusTranslations } from '@/lib/types';

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
import { CheckCircle, XCircle, FileText, MoreHorizontal, Banknote, Euro } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

async function sendEmail(to: string, subject: string, body: string) {
  // Email sending is disabled
  return Promise.resolve();
}

const rejectionSchema = z.object({
  reason: z.string().min(10, { message: 'Een reden voor afkeuring van minimaal 10 tekens is verplicht.' }),
});
type RejectionFormData = z.infer<typeof rejectionSchema>;

const StatusBadge = ({ status }: { status: DeclarationStatus }) => {
    const variant: Record<DeclarationStatus, "secondary" | "default" | "destructive" | "success"> = {
        pending: 'secondary',
        approved: 'default',
        rejected: 'destructive',
        paid: 'success'
    };

    const icon: Record<DeclarationStatus, React.ReactNode> = {
        pending: <FileText className="mr-1 h-3 w-3" />,
        approved: <CheckCircle className="mr-1 h-3 w-3" />,
        rejected: <XCircle className="mr-1 h-3 w-3" />,
        paid: <Banknote className="mr-1 h-3 w-3" />,
    };

    return (
        <Badge variant={variant[status] as any} className="flex items-center w-fit">
            {icon[status]}
            {declarationStatusTranslations[status]}
        </Badge>
    );
};


export default function AdminDeclarationsPage() {
    const [declarations, setDeclarations] = useState<Declaration[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRejectionDialogOpen, setIsRejectionDialogOpen] = useState(false);
    const [declarationToReject, setDeclarationToReject] = useState<Declaration | null>(null);
    const { toast } = useToast();
    const { user, isLoaded } = useAuth();
    
    const rejectionForm = useForm<RejectionFormData>({
        resolver: zodResolver(rejectionSchema),
        defaultValues: { reason: '' },
    });

    useEffect(() => {
        if (!isLoaded || user?.role !== 'admin') {
          if(isLoaded) setLoading(false);
          return;
        }

        let active = true;
        const fetchDeclarations = async () => {
            const { data, error } = await supabase
              .from('declarations')
              .select(`
                *,
                profiles!declarations_user_id_fkey (
                  first_name,
                  last_name,
                  email
                )
              `)
              .order('submitted_at', { ascending: false })
              .limit(50);
            if (!active) return;
            if (error) {
                console.error('Error fetching declarations:', error);
                toast({ variant: 'destructive', title: 'Fout bij ophalen', description: 'Kon de declaraties niet ophalen.', duration: 9000 });
                setLoading(false);
                return;
            }
            const rows = data || [];
            // Generate signed URLs for receipts (bucket is private)
            const mapped: Declaration[] = await Promise.all(rows.map(async (r: any) => {
                let receiptUrl = '';
                if (r.receipt_path) {
                    try {
                        // Create signed URL that expires in 1 hour
                        const { data: signedData, error: signedError } = await supabase.storage
                            .from('receipts')
                            .createSignedUrl(r.receipt_path, 3600); // 1 hour expiry
                        if (!signedError && signedData) {
                            receiptUrl = signedData.signedUrl;
                        }
                    } catch (err) {
                        console.error('Error generating signed URL for receipt:', err);
                    }
                }
                // Extract profile data (Supabase returns it as an object or array)
                const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
                return {
                    id: r.id,
                    userId: r.user_id,
                    userFirstName: profile?.first_name || '-',
                    userLastName: profile?.last_name || '-',
                    userEmail: profile?.email || '-',
                    date: r.date ? new Date(r.date).toISOString() : new Date().toISOString(),
                    amount: Number(r.amount) || 0,
                    reason: r.reason || '',
                    isToll: !!r.is_toll,
                    receiptUrl,
                    status: r.status,
                    submittedAt: r.submitted_at || new Date().toISOString(),
                    rejectionReason: r.rejection_reason || undefined,
                } as Declaration;
            }));
            setDeclarations(mapped);
            setLoading(false);
        };

        fetchDeclarations();
        const ch = supabase.channel('admin-declarations').on('postgres_changes', { event: '*', schema: 'public', table: 'declarations' }, fetchDeclarations).subscribe();
        return () => { active = false; ch.unsubscribe(); };
    }, [toast, user, isLoaded]);
    
    const updateDeclarationStatus = async (declaration: Declaration, newStatus: DeclarationStatus) => {
        try {
            const { error } = await supabase
              .from('declarations')
              .update({ status: newStatus })
              .eq('id', declaration.id);
            if (error) throw error;
            
            // Optimistically update the local state immediately
            setDeclarations(prev => prev.map(dec => 
                dec.id === declaration.id 
                    ? { ...dec, status: newStatus }
                    : dec
            ));
            
            let emailSubject = '';
            let emailBody = '';
            
            switch(newStatus) {
                case 'approved':
                    emailSubject = 'Je declaratie is goedgekeurd';
                    emailBody = `Beste ${declaration.userFirstName},\n\nJe declaratie van €${declaration.amount.toFixed(2)} voor "${declaration.reason}" ingediend op ${format(new Date(declaration.date), 'dd-MM-yyyy', { locale: nl })} is goedgekeurd.`;
                    break;
                case 'paid':
                     toast({
                        title: "Declaratie Uitbetaald",
                        description: `Declaratie van ${declaration.userFirstName} is als uitbetaald gemarkeerd.`
                    });
                    // No email needed for 'paid' status
                    return;
            }

            if(emailSubject && emailBody) {
                 await sendEmail(declaration.userEmail, emailSubject, emailBody);
            }
           
            toast({
                title: `Declaratie ${declarationStatusTranslations[newStatus]}`,
                description: `De declaratie van ${declaration.userFirstName} is bijgewerkt.`
            })
        } catch (error) {
            console.error("Error updating status:", error);
            toast({ variant: "destructive", title: "Update Mislukt" })
            // Revert optimistic update on error
            setDeclarations(prev => prev.map(dec => 
                dec.id === declaration.id 
                    ? { ...dec, status: declaration.status }
                    : dec
            ));
        }
    };


    const openRejectionDialog = (declaration: Declaration) => {
        setDeclarationToReject(declaration);
        rejectionForm.reset();
        setIsRejectionDialogOpen(true);
    };

    const handleReject = async (data: RejectionFormData) => {
        if (!declarationToReject) return;

        try {
            const { error } = await supabase
              .from('declarations')
              .update({ status: 'rejected', rejection_reason: data.reason })
              .eq('id', declarationToReject.id);
            if (error) throw error;
            
            // Optimistically update the local state immediately
            setDeclarations(prev => prev.map(dec => 
                dec.id === declarationToReject.id 
                    ? { ...dec, status: 'rejected' as DeclarationStatus, rejectionReason: data.reason }
                    : dec
            ));
            
            await sendEmail(
                declarationToReject.userEmail,
                'Je declaratie is afgekeurd',
                `Beste ${declarationToReject.userFirstName},\n\nJe declaratie van €${declarationToReject.amount.toFixed(2)} voor "${declarationToReject.reason}" ingediend op ${format(new Date(declarationToReject.date), 'dd-MM-yyyy', { locale: nl })} is afgekeurd.\n\nReden: ${data.reason}`
            );
            toast({
                title: "Declaratie Afgekeurd",
                description: `De declaratie van ${declarationToReject.userFirstName} is afgekeurd.`
            });
            setIsRejectionDialogOpen(false);
            setDeclarationToReject(null);
        } catch (error) {
            console.error("Error updating status:", error);
            toast({ variant: "destructive", title: "Update Mislukt" });
            // Revert optimistic update on error
            setDeclarations(prev => prev.map(dec => 
                dec.id === declarationToReject.id 
                    ? { ...dec, status: declarationToReject.status, rejectionReason: declarationToReject.rejectionReason }
                    : dec
            ));
        } finally {
            setIsRejectionDialogOpen(false);
            setDeclarationToReject(null);
        }
    };


    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Declaratiebeheer</h1>
                    <p className="text-muted-foreground">Overzicht van alle ingediende declaraties. Beoordeel en wijzig hier hun status.</p>
                </div>
            </div>
            <Card>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Ingezonden op</TableHead>
                                <TableHead>Medewerker</TableHead>
                                <TableHead>Datum Declaratie</TableHead>
                                <TableHead>Bedrag</TableHead>
                                <TableHead>Reden</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Acties</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                        <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                                        <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                                    </TableRow>
                                ))
                            ) : declarations.length > 0 ? (
                                declarations.map(dec => (
                                    <TableRow key={dec.id}>
                                        <TableCell>{dec.submittedAt ? format(new Date(dec.submittedAt), 'dd-MM-yyyy HH:mm') : '-'}</TableCell>
                                        <TableCell>{dec.userFirstName} {dec.userLastName}</TableCell>
                                        <TableCell>{format(new Date(dec.date), 'dd-MM-yyyy')}</TableCell>
                                        <TableCell>€ {dec.amount.toFixed(2)}</TableCell>
                                        <TableCell className="flex items-center gap-2">
                                            {dec.isToll && (
                                                <span title="Dit is een tol-declaratie">
                                                    <Euro className="h-4 w-4 text-muted-foreground" />
                                                </span>
                                            )}
                                            {dec.reason}
                                        </TableCell>
                                        <TableCell><StatusBadge status={dec.status} /></TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button variant="outline" size="sm" asChild>
                                                    <a href={dec.receiptUrl} target="_blank" rel="noopener noreferrer">Bekijk Bon</a>
                                                </Button>
                                                {(dec.status === 'pending' || dec.status === 'approved') && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            {dec.status === 'pending' && (
                                                                <>
                                                                    <DropdownMenuItem onClick={() => updateDeclarationStatus(dec, 'approved')}>
                                                                        <CheckCircle className="mr-2 h-4 w-4" />
                                                                        Goedkeuren
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => openRejectionDialog(dec)}>
                                                                        <XCircle className="mr-2 h-4 w-4" />
                                                                        Afkeuren
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                            {dec.status === 'approved' && (
                                                                <DropdownMenuItem onClick={() => updateDeclarationStatus(dec, 'paid')}>
                                                                    <Banknote className="mr-2 h-4 w-4" />
                                                                    Markeer als uitbetaald
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center h-24">
                                        Er zijn nog geen declaraties ingediend.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isRejectionDialogOpen} onOpenChange={setIsRejectionDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Declaratie Afkeuren</DialogTitle>
                        <DialogDescription>
                            Voer een duidelijke reden in waarom deze declaratie wordt afgekeurd. De gebruiker ontvangt deze reden per e-mail.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...rejectionForm}>
                        <form onSubmit={rejectionForm.handleSubmit(handleReject)} className="space-y-4">
                            <FormField
                                control={rejectionForm.control}
                                name="reason"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Reden van afkeuring</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Bijv. bonnetje is onleesbaar, dit is geen zakelijke uitgave, etc." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="secondary">Annuleren</Button>
                                </DialogClose>
                                <Button type="submit">Afkeuring bevestigen</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

        </div>
    );
}
