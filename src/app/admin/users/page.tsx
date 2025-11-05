

"use client";

import { useState, useEffect, useCallback } from 'react';
import type { User } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, UserX, UserCheck, Edit } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/use-auth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { mapAppToSupabase, mapSupabaseToApp } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const UserManagement = () => {
    const { user: currentUser, isLoaded } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [userToToggleStatus, setUserToToggleStatus] = useState<User | null>(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [isAlertOpen, setIsAlertOpen] = useState(false);
    const [isAddUserOpen, setIsAddUserOpen] = useState(false);

    // Admin create-user schema: no confirmPassword needed
    const adminCreateUserSchema = z.object({
        firstName: z.string().min(1, { message: 'Voornaam is verplicht.' }),
        lastName: z.string().min(1, { message: 'Achternaam is verplicht.' }),
        email: z.string().email({ message: 'Voer een geldig emailadres in.' }),
        password: z.string().min(6, { message: 'Wachtwoord moet minimaal 6 tekens lang zijn.' }),
    });
    type AdminCreateUserFormData = z.infer<typeof adminCreateUserSchema>;

    const form = useForm<AdminCreateUserFormData>({
        resolver: zodResolver(adminCreateUserSchema),
        defaultValues: {
            firstName: "",
            lastName: "",
            email: "",
            password: "",
        },
    });

    // Helper to reload the user list
    const refreshUsers = useCallback(async () => {
        console.log('[refreshUsers] Starting to fetch users...');
        setLoading(true);
        try {
            console.log('[refreshUsers] Executing Supabase query...');
            // Try without order by first to see if that's causing the issue
            const usersResult = await supabase
                .from('profiles')
                .select('*')
                .limit(1000); // Add limit to prevent timeout

            console.log('[refreshUsers] Query completed');
            console.log('[refreshUsers] Has error?', !!usersResult.error);
            console.log('[refreshUsers] Error object:', usersResult.error);
            console.log('[refreshUsers] Data length:', usersResult.data?.length || 0);
            
            if (usersResult.error) {
                console.error("[refreshUsers] Error fetching users:", usersResult.error);
                console.error("Error code:", usersResult.error?.code);
                console.error("Error message:", usersResult.error?.message);
                console.error("Error details:", usersResult.error?.details);
                console.error("Error hint:", usersResult.error?.hint);
                console.error("Full error stringified:", JSON.stringify(usersResult.error, null, 2));
                toast({
                    variant: 'destructive',
                    title: 'Fout bij ophalen medewerkers',
                    description: usersResult.error?.message || usersResult.error?.code || 'Er is een fout opgetreden bij het ophalen van de medewerkers.',
                });
                setLoading(false);
                return;
            }

            if (!usersResult.data) {
                console.error("[refreshUsers] No data returned from query");
                toast({
                    variant: 'destructive',
                    title: 'Fout bij ophalen medewerkers',
                    description: 'Geen data ontvangen van de server.',
                });
                setLoading(false);
                return;
            }

            console.log('[refreshUsers] Mapping users data...');
            const usersData = (usersResult.data || []).map(doc => ({ uid: doc.id, ...mapSupabaseToApp(doc) })) as User[];
            
            // Sort in JavaScript instead of database
            usersData.sort((a, b) => {
                const nameA = (a.firstName || '').toLowerCase();
                const nameB = (b.firstName || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
            
            console.log('[refreshUsers] Mapped users:', usersData.length);
            setUsers(usersData);
            setLoading(false);
        } catch (error: any) {
            console.error("[refreshUsers] Unexpected error:", error);
            console.error("[refreshUsers] Error type:", typeof error);
            console.error("[refreshUsers] Error name:", error?.name);
            console.error("[refreshUsers] Error message:", error?.message);
            console.error("[refreshUsers] Error stack:", error?.stack);
            console.error("[refreshUsers] Error stringified:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
            toast({
                variant: 'destructive',
                title: 'Fout bij ophalen medewerkers',
                description: error?.message || 'Er is een onverwachte fout opgetreden.',
            });
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (!isLoaded) {
            return;
        }

        if (!currentUser || currentUser.role !== 'admin') {
            setLoading(false);
            return;
        }

        setLoading(true);
        refreshUsers();

        // Subscribe to changes
        const channel = supabase
            .channel('users-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
                refreshUsers();
            })
            .subscribe();

        return () => { 
            channel.unsubscribe(); 
        };
    }, [isLoaded, currentUser, refreshUsers]);
    
    const handleToggleUserStatus = (user: User) => {
        if (user.status === 'active') {
            setUserToToggleStatus(user);
            setIsAlertOpen(true);
        } else {
            handleActivateUser(user);
        }
    };
    
    const handleActivateUser = async (userToActivate: User) => {
        if (!userToActivate || !userToActivate.uid) return;
        setIsUpdatingStatus(true);
        try {
            const mappedData = mapAppToSupabase({ status: 'active' });
            const { error } = await supabase
                .from('profiles')
                .update(mappedData)
                .eq('id', userToActivate.uid);
            
            if (error) throw error;
            
            toast({
                title: "Medewerker geactiveerd",
                description: `Medewerker ${userToActivate.email} is geactiveerd en kan weer inloggen.`,
            });
        } catch (error: any) {
             console.error("Error activating user:", error);
             toast({
                variant: 'destructive',
                title: 'Activeren Mislukt',
                description: error.message || 'Er is een onbekende fout opgetreden.',
            });
        } finally {
            setIsUpdatingStatus(false);
        }
    };

     const handleConfirmDeactivate = async () => {
        if (!userToToggleStatus || !userToToggleStatus.uid) return;
        setIsUpdatingStatus(true);

        try {
            const mappedData = mapAppToSupabase({ status: 'inactive' });
            const { error } = await supabase
                .from('profiles')
                .update(mappedData)
                .eq('id', userToToggleStatus.uid);
            
            if (error) throw error;
            
            toast({
                title: "Medewerker gedeactiveerd",
                description: `Medewerker ${userToToggleStatus.email} is gedeactiveerd en kan niet meer inloggen.`,
            });
        } catch (error: any) {
             console.error("Error deactivating user:", error);
             toast({
                variant: 'destructive',
                title: 'Deactiveren Mislukt',
                description: error.message || 'Er is een onbekende fout opgetreden.',
            });
        } finally {
            setIsUpdatingStatus(false);
            setIsAlertOpen(false);
            setUserToToggleStatus(null);
        }
      };
      
    async function onAddUserSubmit(data: AdminCreateUserFormData) {
        try {
            // Call API route to create user (uses service role on server)
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (!token) {
                throw new Error('Geen geldige adminsessie. Log opnieuw in.');
            }

            const response = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    email: data.email,
                    password: data.password,
                    firstName: data.firstName,
                    lastName: data.lastName,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create user');
            }

            const result = await response.json();

            toast({ title: "Medewerker Aangemaakt", description: `Medewerker ${data.firstName} is succesvol aangemaakt.` });
            form.reset();
            setIsAddUserOpen(false);
            // Ensure the new user appears even if Supabase Realtime is disabled
            refreshUsers();
        } catch (error: any) {
            let description = "Er is een onbekende fout opgetreden.";
            if (error.message?.includes('already registered')) {
                description = 'Dit e-mailadres is al in gebruik.';
            } else if (error.message?.includes('password')) {
                description = 'Het wachtwoord moet minimaal 6 tekens lang zijn.';
            } else if (error.message) {
                description = error.message;
            }
            toast({
                variant: "destructive",
                title: "Aanmaken mislukt",
                description: description,
            });
        }
    }


    return (
        <>
            <div className="flex justify-between items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Medewerkers</h1>
                    <p className="text-muted-foreground">Overzicht van alle medewerkers in het systeem.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={roleFilter} onValueChange={(v: any) => setRoleFilter(v)}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Rol" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle rollen</SelectItem>
                      <SelectItem value="admin">Admins</SelectItem>
                      <SelectItem value="user">Gebruikers</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle status</SelectItem>
                      <SelectItem value="active">Actief</SelectItem>
                      <SelectItem value="inactive">Inactief</SelectItem>
                    </SelectContent>
                  </Select>
                <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                    <DialogTrigger asChild>
                         <Button>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Nieuwe Medewerker
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Nieuwe Medewerker Toevoegen</DialogTitle>
                             <DialogDescription>
                                Voer de gegevens in om een nieuwe medewerker aan te maken. Het wachtwoord moet minimaal 6 tekens lang zijn.
                            </DialogDescription>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onAddUserSubmit)} className="space-y-4">
                               <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="firstName"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Voornaam</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Jan" {...field} disabled={form.formState.isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                    />
                                    <FormField
                                    control={form.control}
                                    name="lastName"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Achternaam</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Jansen" {...field} disabled={form.formState.isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                    />
                                </div>
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Emailadres</FormLabel>
                                        <FormControl>
                                            <Input placeholder="u@voorbeeld.com" {...field} disabled={form.formState.isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Wachtwoord</FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="••••••••" {...field} disabled={form.formState.isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="ghost" disabled={form.formState.isSubmitting}>Annuleren</Button></DialogClose>
                                    <Button type="submit" disabled={form.formState.isSubmitting}>
                                        {form.formState.isSubmitting && <Loader2 className="animate-spin mr-2" />}
                                        Aanmaken
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
                </div>
            </div>
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Naam</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Rol</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[100px] text-right">Acties</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 3 }).map((_, index) => (
                                <TableRow key={index}>
                                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-10 w-20 ml-auto" /></TableCell>
                                </TableRow>
                                ))
                            ) : (
                                users
                                  .filter(u => (roleFilter === 'all' || u.role === roleFilter) && (statusFilter === 'all' || u.status === statusFilter))
                                  .map(user => (
                                    <TableRow key={user.uid} className={cn(user.status === 'inactive' && 'bg-muted/50 text-muted-foreground', "hover:bg-muted/50 cursor-pointer")} onClick={() => router.push(`/admin/users/${user.uid}`)}>
                                        <TableCell>{user.firstName} {user.lastName}</TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                                {user.role === 'admin' ? 'Admin' : 'Gebruiker'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                             <span className={cn("px-2 py-1 rounded-full text-xs font-medium", user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                                                {user.status === 'active' ? 'Actief' : 'Inactief'}
                                             </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                             <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                onClick={(e) => { e.stopPropagation(); handleToggleUserStatus(user);}}
                                                disabled={user.uid === currentUser?.uid || isUpdatingStatus}
                                                title={user.status === 'active' ? 'Deactiveer gebruiker' : 'Activeer gebruiker'}
                                             >
                                                {user.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4 text-green-600" />}
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); router.push(`/admin/users/${user.uid}`)}}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                  ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Deze actie zal de medewerker deactiveren. Ze kunnen niet meer inloggen, maar hun data blijft bewaard. Deze actie kan ongedaan worden gemaakt door de medewerker opnieuw te activeren.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel disabled={isUpdatingStatus} onClick={() => setUserToToggleStatus(null)}>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmDeactivate} disabled={isUpdatingStatus} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {isUpdatingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isUpdatingStatus ? 'Deactiveren...' : 'Deactiveren'}
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};


export default function AdminUsersPage() {
  return (
    <div className="space-y-8">
      <UserManagement />
    </div>
  );
}
