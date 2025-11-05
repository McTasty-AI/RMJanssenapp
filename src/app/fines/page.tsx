
"use client";

import { useState, useMemo, useEffect } from 'react';
import type { Fine, FinePaidBy } from '@/lib/types';
import { finePaidByTranslations } from '@/lib/types';
import { useUserCollection } from '@/hooks/use-user-collection';
import { format, getYear, startOfYear, endOfYear, isWithinInterval } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Building, User as UserIcon, AlertTriangle, BookText } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';

const FineBadge = ({ paidBy }: { paidBy: FinePaidBy }) => {
    const variant = paidBy === 'company' ? 'secondary' : 'default';
    const icon = paidBy === 'company' ? <Building className="mr-1 h-3 w-3" /> : <UserIcon className="mr-1 h-3 w-3" />;
    return (
        <Badge variant={variant} className="flex items-center w-fit">
            {icon}
            {finePaidByTranslations[paidBy]}
        </Badge>
    );
};

export default function FinesPage() {
    const { documents: fines, loading: loadingFines } = useUserCollection<Fine>('fines');
    const [currentYear] = useState(new Date().getFullYear());
    const [policyText, setPolicyText] = useState<string | null>(null);
    const [loadingPolicy, setLoadingPolicy] = useState(true);

    useEffect(() => {
        const fetchPolicy = async () => {
            setLoadingPolicy(true);
            try {
                const { data, error } = await supabase
                    .from('company_profile')
                    .select('policy_text')
                    .eq('id', 'main')
                    .maybeSingle();
                
                if (error) {
                    throw error;
                }
                
                if (data) {
                    setPolicyText(data.policy_text);
                } else {
                    setPolicyText("Er is momenteel geen specifiek boetebeleid vastgesteld.");
                }
            } catch (error) {
                console.error("Error fetching policy:", error);
                setPolicyText("Kon het boetebeleid niet laden.");
            } finally {
                setLoadingPolicy(false);
            }
        };
        fetchPolicy();
    }, []);

    const yearlyFines = useMemo(() => {
        const start = startOfYear(new Date(currentYear, 0, 1));
        const end = endOfYear(new Date(currentYear, 0, 1));
        return fines
            .filter(fine => isWithinInterval(new Date(fine.date), { start, end }))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [fines, currentYear]);

    const companyPaidFines = useMemo(() => 
        yearlyFines.filter(f => f.paidBy === 'company')
    , [yearlyFines]);
    
    const driverPaidFines = useMemo(() => 
        yearlyFines.filter(f => f.paidBy === 'driver')
    , [yearlyFines]);
    
    const companyPaidCount = companyPaidFines.length;
    const companyPaidTotalAmount = companyPaidFines.reduce((sum, fine) => sum + fine.amount, 0);

    const driverPaidTotalAmount = driverPaidFines.reduce((sum, fine) => sum + fine.amount, 0);

    const loading = loadingFines || loadingPolicy;

    return (
        <div className="w-full max-w-[90%] mx-auto p-4 md:p-8 space-y-8">
            <div>
                <h1 className="text-2xl font-bold">Mijn Boetes</h1>
                <p className="text-muted-foreground">Hieronder vindt u een overzicht van de aan u toegewezen boetes voor dit jaar.</p>
            </div>

            <Alert>
                <BookText className="h-4 w-4" />
                <AlertTitle>Bedrijfsbeleid Boetes</AlertTitle>
                <AlertDescription>
                   {loading ? (
                     <Skeleton className="h-12 w-full" />
                   ) : (
                    <p className="whitespace-pre-wrap">{policyText}</p>
                   )}
                   <div className="mt-2 text-sm border-t pt-2">
                        <p><strong>Aantal door bedrijf betaalde boetes dit jaar:</strong> {companyPaidCount}</p>
                        <p><strong>Totaalbedrag door bedrijf betaald dit jaar:</strong> €{companyPaidTotalAmount.toFixed(2)}</p>
                        <p><strong>Totaalbedrag door chauffeur betaald dit jaar:</strong> €{driverPaidTotalAmount.toFixed(2)}</p>
                   </div>
                </AlertDescription>
            </Alert>
            
            <Card>
                <CardHeader>
                    <CardTitle>Overzicht voor {currentYear}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Datum</TableHead>
                                <TableHead>Kenteken</TableHead>
                                <TableHead>Reden</TableHead>
                                <TableHead>Bedrag</TableHead>
                                <TableHead>Betaald door</TableHead>
                                <TableHead className="text-right">Boete</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loadingFines ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                        <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                                        <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                                    </TableRow>
                                ))
                            ) : yearlyFines.length > 0 ? (
                                yearlyFines.map(fine => (
                                    <TableRow key={fine.id}>
                                        <TableCell>{format(new Date(fine.date), 'dd-MM-yyyy')}</TableCell>
                                        <TableCell>{fine.licensePlate || '-'}</TableCell>
                                        <TableCell>{fine.reason}</TableCell>
                                        <TableCell>€{fine.amount.toFixed(2)}</TableCell>
                                        <TableCell><FineBadge paidBy={fine.paidBy} /></TableCell>
                                        <TableCell className="text-right">
                                            {fine.receiptUrl && (
                                                <Button variant="outline" size="sm" asChild>
                                                    <a href={fine.receiptUrl} target="_blank" rel="noopener noreferrer">Bekijk</a>
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24">
                                        Gefeliciteerd! U heeft dit jaar nog geen boetes.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}




