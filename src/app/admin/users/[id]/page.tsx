

"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase/client';
import { mapSupabaseToApp, mapAppToSupabase } from '@/lib/utils';
import type { User, Vehicle, UserRole, EmploymentType, WeekDay } from '@/lib/types';
import { employmentTypes, employmentTypeTranslations, weekDays, salaryScaleGroups, salaryScaleSteps } from '@/lib/types';
// Use a permissive edit schema so saving role/flags doesn't get blocked by other tabs
const editUserSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']).optional(),
  // In praktijk kan dit veld tijdelijk undefined, null of een niet-array zijn (bij eerste render)
  // daarom accepteren we hier breed en normaliseren we bij opslag.
  assignedLicensePlates: z.any().optional(),
  salaryScaleGroup: z.string().optional().nullable(),
  salaryScaleStep: z.coerce.number().optional().nullable(),
  employmentType: z.string().optional().nullable(),
  contractHours: z.coerce.number().optional().nullable(),
  workDays: z.any().optional().nullable(),
  homeStreet: z.string().optional().nullable(),
  homeHouseNumber: z.string().optional().nullable(),
  homePostalCode: z.string().optional().nullable(),
  homeCity: z.string().optional().nullable(),
  station: z.string().optional().nullable(),
  hasTravelAllowance: z.boolean().optional(),
  travelDistance: z.coerce.number().optional().nullable(),
  travelAllowanceRate: z.coerce.number().optional().nullable(),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine((data) => {
  if (data.password && data.password.length > 0) {
    return data.password === data.confirmPassword;
  }
  return true;
}, { message: 'Wachtwoorden komen niet overeen.', path: ['confirmPassword'] })
.refine((data) => {
  if (data.password && data.password.length > 0) {
    return data.password.length >= 6;
  }
  return true;
}, { message: 'Wachtwoord moet minimaal 6 tekens bevatten.', path: ['password'] });
type EditUserFormData = z.infer<typeof editUserSchema>;
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Save, ArrowLeft, Shield, ChevronsUpDown, CaseSensitive, Hourglass, Scale, Euro, Car, Route } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';

const MultiSelectPlates = ({ control, disabled, licensePlates }: { control: any, disabled: boolean, licensePlates: Vehicle[] }) => {
    return (
        <FormField
            control={control}
            name="assignedLicensePlates"
            render={({ field }) => {
                const handleCheckedChange = (plate: string, checked: boolean) => {
                    const currentValue = field.value || [];
                    if (checked) {
                        field.onChange([...currentValue, plate]);
                    } else {
                        field.onChange(currentValue.filter((p: string) => p !== plate));
                    }
                };

                const handleNoPlateCheckedChange = (checked: boolean) => {
                    if (checked) {
                        field.onChange([]);
                    }
                };

                const hasNoPlates = !field.value || field.value.length === 0;

                return (
                    <FormItem>
                        <FormLabel>Toegewezen Kentekens</FormLabel>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-full justify-between" disabled={disabled || licensePlates.length === 0}>
                                    <span className="truncate pr-2">
                                        {licensePlates.length === 0 ? 'Geen voertuigen beschikbaar' : hasNoPlates ? 'Geen kenteken' : field.value.join(', ')}
                                    </span>
                                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                                <DropdownMenuLabel>Beschikbare Kentekens</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuCheckboxItem
                                    checked={hasNoPlates}
                                    onCheckedChange={handleNoPlateCheckedChange}
                                    onSelect={(e) => e.preventDefault()}
                                >
                                    Geen kenteken
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator />
                                {licensePlates.map(vehicle => (
                                    <DropdownMenuCheckboxItem
                                        key={vehicle.id}
                                        checked={field.value?.includes(vehicle.licensePlate)}
                                        onCheckedChange={(checked) => handleCheckedChange(vehicle.licensePlate, !!checked)}
                                        onSelect={(e) => e.preventDefault()}
                                    >
                                        {vehicle.licensePlate}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <FormMessage />
                    </FormItem>
                );
            }}
        />
    );
};

export default function UserDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params.id as string;
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const { toast } = useToast();

    const form = useForm<EditUserFormData>({
        resolver: zodResolver(editUserSchema),
        defaultValues: {
            firstName: '',
            lastName: '',
            email: '',
            password: '',
            confirmPassword: '',
            role: 'user',
            assignedLicensePlates: [],
            salaryScaleGroup: undefined,
            salaryScaleStep: undefined,
            employmentType: undefined,
            contractHours: 0,
            workDays: [],
            homeStreet: '',
            homeHouseNumber: '',
            homePostalCode: '',
            homeCity: '',
            station: '',
            hasTravelAllowance: false,
            travelDistance: 0,
            travelAllowanceRate: 0.23,
        },
    });

    const employmentType = form.watch('employmentType');
    const hasTravelAllowance = form.watch('hasTravelAllowance');

    useEffect(() => {
        if (employmentType === 'fulltime') {
            form.setValue('contractHours', 40, { shouldValidate: true });
        }
    }, [employmentType, form]);

    useEffect(() => {
        let mounted = true;
        const fetch = async () => {
            const { data } = await supabase.from('vehicles').select('*');
            if (!mounted) return;
            const all = ((data || []).map(row => ({ ...(mapSupabaseToApp(row) as any), id: row.id })) as Vehicle[]);
            setVehicles(all.filter(v => v.status !== 'Inactief' && v.status !== 'Verkocht'));
        };
        fetch();
        const ch = supabase.channel('users-vehicles').on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, fetch).subscribe();
        return () => { mounted = false; ch.unsubscribe(); };
    }, []);


    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle()
            .then(({ data, error }) => {
            if (data) {
                const userData = { uid: data.id, ...mapSupabaseToApp(data) } as User;
                setUser(userData);
                    form.reset({
                        ...userData,
                        salaryScaleGroup: (userData.salaryScaleGroup ?? undefined) as any,
                        salaryScaleStep: (userData.salaryScaleStep ?? undefined) as any,
                        employmentType: userData.employmentType ?? undefined,
                        contractHours: userData.contractHours ?? 0,
                    workDays: userData.workDays ?? [],
                    homeStreet: userData.homeStreet ?? '',
                    homeHouseNumber: userData.homeHouseNumber ?? '',
                    homePostalCode: userData.homePostalCode ?? '',
                    homeCity: userData.homeCity ?? '',
                    station: userData.station ?? '',
                    hasTravelAllowance: userData.hasTravelAllowance ?? false,
                    travelDistance: userData.travelDistance ?? 0,
                    travelAllowanceRate: userData.travelAllowanceRate ?? 0.23,
                });
            } else if (error) {
                toast({ variant: 'destructive', title: 'Gebruiker niet gevonden' });
                router.push('/admin/users');
            }
        }).then(() => setLoading(false));
    }, [userId, form, router, toast]);

    const onSubmit = async (data: EditUserFormData) => {
        try {
            // Exclude password fields if they are empty
            const { password, confirmPassword, ...dataToSave } = data as any;
            const trimmedPassword = password?.trim() ?? '';
            
            const finalData: Partial<User> = {
                ...dataToSave,
                contractHours: Number(data.contractHours),
                workDays: data.workDays,
            };

            // Normaliseer potentieel onzekere velden
            if (Array.isArray((data as any).assignedLicensePlates)) {
                (finalData as any).assignedLicensePlates = (data as any).assignedLicensePlates as string[];
            }

            if (data.employmentType === 'dga') {
                delete finalData.salaryScaleGroup;
                delete finalData.salaryScaleStep;
            } else {
                finalData.salaryScaleGroup = data.salaryScaleGroup as any;
                finalData.salaryScaleStep = Number(data.salaryScaleStep) as any;
            }

            if (finalData.salaryScaleGroup === undefined) delete finalData.salaryScaleGroup;
            if (finalData.salaryScaleStep === undefined || isNaN(finalData.salaryScaleStep)) delete finalData.salaryScaleStep;

            const payload = mapAppToSupabase(finalData);
            // Update main fields directly via RLS (admin kan elk profiel bijwerken)
            const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
            if (error) throw error;

            const roleChanged = Boolean(user && data.role && user.role !== data.role);
            const passwordChanged = trimmedPassword.length > 0;
            const needsPrivilegedCall = roleChanged || passwordChanged;
            let token: string | undefined;

            if (needsPrivilegedCall) {
                const { data: sessionData } = await supabase.auth.getSession();
                token = sessionData?.session?.access_token;
                if (!token) {
                    throw new Error('Geen geldige sessie gevonden voor admin-actie. Log opnieuw in en probeer het opnieuw.');
                }
            }

            if (roleChanged && token) {
                const resp = await fetch('/api/admin/users/update-role', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ userId, role: data.role }),
                });
                if (!resp.ok) {
                    const details = await resp.json().catch(() => undefined);
                    throw new Error(details?.error || 'Rol bijwerken mislukt');
                }
            }

            if (passwordChanged && token) {
                const resp = await fetch('/api/admin/users/update-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ userId, password: trimmedPassword }),
                });
                if (!resp.ok) {
                    const details = await resp.json().catch(() => undefined);
                    throw new Error(details?.error || 'Wachtwoord wijzigen mislukt');
                }
            }

            const updates: string[] = [];
            if (roleChanged) updates.push('rol');
            if (passwordChanged) updates.push('wachtwoord');

            toast({
                title: 'Medewerker bijgewerkt',
                description: updates.length
                    ? `De ${updates.join(' en ')} ${updates.length > 1 ? 'zijn' : 'is'} succesvol opgeslagen.`
                    : 'De gegevens zijn succesvol opgeslagen.',
            });

            form.reset({ ...data, password: '', confirmPassword: '' } as any); // Reset dirty state, wis wachtwoordvelden
            setUser(prev => prev ? { ...prev, ...finalData, role: data.role ?? prev.role } as User : prev);
        } catch (error) {
            console.error('Error updating user:', error);
            toast({ variant: 'destructive', title: 'Opslaan Mislukt', description: error instanceof Error ? error.message : undefined });
        }
    };

    const onInvalid = (errs: any) => {
        console.warn('Validatie mislukt:', errs);
        toast({ variant: 'destructive', title: 'Kan niet opslaan', description: 'Controleer de gemarkeerde velden.' });
    };

    if (loading) {
        return (
            <div className="space-y-8">
                <Skeleton className="h-8 w-48 mb-4" />
                <Skeleton className="h-[500px] w-full" />
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <Button variant="ghost" onClick={() => router.push('/admin/users')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Terug naar overzicht
            </Button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Medewerkerdossier: {user?.firstName} {user?.lastName}</h1>
                    <p className="text-muted-foreground">Beheer hier de gegevens en instellingen van de medewerker.</p>
                </div>
            </div>
            <Form {...form}>
                <form id="user-edit-form" noValidate onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Account & Instellingen</CardTitle>
                            <CardDescription>Beheer hier de gegevens en instellingen van de medewerker.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <Tabs defaultValue="account">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="account">Account</TabsTrigger>
                                    <TabsTrigger value="employment">Dienstverband</TabsTrigger>
                                    <TabsTrigger value="allowance">Vergoedingen</TabsTrigger>
                                </TabsList>
                                <TabsContent value="account" className="pt-6 space-y-6">
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField control={form.control} name="firstName" render={({ field }) => (
                                            <FormItem><FormLabel>Voornaam</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="lastName" render={({ field }) => (
                                            <FormItem><FormLabel>Achternaam</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                     </div>
                                      <FormField control={form.control} name="email" render={({ field }) => (
                                        <FormItem><FormLabel>E-mailadres</FormLabel><FormControl><Input type="email" {...field} value={field.value ?? ''} disabled /></FormControl><FormMessage /></FormItem>
                                    )} />
                                     <FormField
                                        control={form.control}
                                        name="role"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                                <div className="space-y-0.5">
                                                <FormLabel className="text-base">
                                                    Adminrechten
                                                </FormLabel>
                                                <p className="text-sm text-muted-foreground">
                                                    Geeft de gebruiker toegang tot alle beheerpagina&apos;s.
                                                </p>
                                                </div>
                                                <FormControl>
                                                <Switch
                                                    checked={field.value === 'admin'}
                                                    onCheckedChange={(checked) => field.onChange(checked ? 'admin' : 'user')}
                                                />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <Separator />
                                     <div className="space-y-2">
                                        <h3 className="text-md font-medium">Wachtwoord Wijzigen</h3>
                                        <p className="text-sm text-muted-foreground">Laat leeg om het huidige wachtwoord te behouden.</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField control={form.control} name="password" render={({ field }) => (
                                            <FormItem><FormLabel>Nieuw Wachtwoord</FormLabel><FormControl><Input type="password" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                                            <FormItem><FormLabel>Bevestig Wachtwoord</FormLabel><FormControl><Input type="password" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </div>
                                </TabsContent>
                                <TabsContent value="employment" className="pt-6 space-y-6">
                                     <MultiSelectPlates control={form.control} disabled={form.formState.isSubmitting} licensePlates={vehicles} />
                                     <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                        {employmentType !== 'dga' && (
                                            <>
                                                <FormField
                                                    control={form.control}
                                                    name="salaryScaleGroup"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Loonschaal</FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <Scale className="mr-2 h-4 w-4 opacity-50" />
                                                                        <SelectValue placeholder="Kies schaal" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent position="popper">
                                                                    {salaryScaleGroups.map(group => (
                                                                        <SelectItem key={group} value={group}>Schaal {group}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="salaryScaleStep"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Trede</FormLabel>
                                                            <Select onValueChange={(val) => field.onChange(Number(val))} value={String(field.value)}>
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <Scale className="mr-2 h-4 w-4 opacity-50" />
                                                                        <SelectValue placeholder="Kies trede" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent position="popper">
                                                                    {salaryScaleSteps.map(step => (
                                                                        <SelectItem key={step} value={String(step)}>{step}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </>
                                        )}
                                         <FormField
                                            control={form.control}
                                            name="employmentType"
                                            render={({ field }) => (
                                                <FormItem className={employmentType === 'dga' ? 'md:col-span-2' : ''}>
                                                    <FormLabel>Type Dienstverband</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <CaseSensitive className="mr-2 h-4 w-4 opacity-50" />
                                                                <SelectValue placeholder="Selecteer type" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent position="popper">
                                                            {employmentTypes.map(type => (
                                                                <SelectItem key={type} value={type}>{employmentTypeTranslations[type]}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="contractHours"
                                            render={({ field }) => (
                                                <FormItem  className={employmentType === 'dga' ? 'md:col-span-2' : ''}>
                                                    <FormLabel>Contracturen / week</FormLabel>
                                                    <div className="relative">
                                                        <Hourglass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <FormControl>
                                                            <Input 
                                                                type="number" 
                                                                {...field} 
                                                                value={field.value ?? ''} 
                                                                className="pl-9" 
                                                                disabled={employmentType === 'fulltime'}
                                                            />
                                                        </FormControl>
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                     </div>
                                     <FormField
                                        control={form.control}
                                        name="workDays"
                                        render={() => (
                                            <FormItem>
                                            <div className="mb-4">
                                                <FormLabel className="text-base">Vaste Werkdagen</FormLabel>
                                                <p className="text-sm text-muted-foreground">
                                                    Selecteer de dagen waarop deze medewerker doorgaans werkt.
                                                </p>
                                            </div>
                                            <div className="flex items-center space-x-6 rounded-md border p-4">
                                                {weekDays.map((day) => (
                                                <FormField
                                                    key={day}
                                                    control={form.control}
                                                    name="workDays"
                                                    render={({ field }) => {
                                                    return (
                                                        <FormItem
                                                        key={day}
                                                        className="flex flex-row items-start space-x-3 space-y-0"
                                                        >
                                                        <FormControl>
                                                            <Checkbox
                                                            checked={field.value?.includes(day)}
                                                            onCheckedChange={(checked) => {
                                                                return checked
                                                                ? field.onChange([...(field.value || []), day])
                                                                : field.onChange(
                                                                    field.value?.filter(
                                                                    (value: WeekDay) => value !== day
                                                                    )
                                                                )
                                                            }}
                                                            />
                                                        </FormControl>
                                                        <FormLabel className="font-normal capitalize">
                                                            {day}
                                                        </FormLabel>
                                                        </FormItem>
                                                    )
                                                    }}
                                                />
                                                ))}
                                            </div>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                        />
                                </TabsContent>
                                <TabsContent value="allowance" className="pt-6 space-y-6">
                                     <FormField
                                        control={form.control}
                                        name="hasTravelAllowance"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                                <div className="space-y-0.5">
                                                <FormLabel className="text-base">
                                                    Reiskostenvergoeding
                                                </FormLabel>
                                                <p className="text-sm text-muted-foreground">
                                                   Activeer om reiskosten te berekenen op basis van gewerkte dagen.
                                                </p>
                                                </div>
                                                <FormControl>
                                                <Switch
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    {hasTravelAllowance && (
                                        <Card className="p-6 bg-muted/30">
                                            <div className="space-y-6">
                                                <div>
                                                    <h3 className="text-md font-medium">Thuisadres</h3>
                                                    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4 mt-2">
                                                        <FormField control={form.control} name="homeStreet" render={({ field }) => (
                                                            <FormItem><FormLabel>Straat</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                        )} />
                                                        <FormField control={form.control} name="homeHouseNumber" render={({ field }) => (
                                                            <FormItem><FormLabel>Huisnummer</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                        )} />
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                                        <FormField control={form.control} name="homePostalCode" render={({ field }) => (
                                                            <FormItem><FormLabel>Postcode</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                        )} />
                                                        <FormField control={form.control} name="homeCity" render={({ field }) => (
                                                            <FormItem><FormLabel>Stad</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                        )} />
                                                    </div>
                                                </div>
                                                
                                                <FormField control={form.control} name="station" render={({ field }) => (
                                                    <FormItem><FormLabel>Standplaats</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="bv. Amsterdam" /></FormControl><FormMessage /></FormItem>
                                                )} />

                                                <Separator />

                                                <div className="grid grid-cols-2 gap-4">
                                                     <FormField control={form.control} name="travelDistance" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Enkele Reisafstand</FormLabel>
                                                            <div className="relative">
                                                                <Route className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                                <FormControl>
                                                                    <Input type="number" placeholder="50" {...field} value={field.value ?? ''} onChange={e => field.onChange(Number(e.target.value))} className="pl-9" />
                                                                </FormControl>
                                                            </div>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                     <FormField control={form.control} name="travelAllowanceRate" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Vergoeding per KM</FormLabel>
                                                             <div className="relative">
                                                                <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                                <FormControl>
                                                                    <Input type="number" step="0.01" placeholder="0.23" {...field} value={field.value ?? ''} onChange={e => field.onChange(Number(e.target.value))} className="pl-9" />
                                                                </FormControl>
                                                            </div>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                </div>
                                                 <p className="text-xs text-muted-foreground pt-2">
                                                    Let op: de afstand wordt niet automatisch berekend. Voer hier de enkele reisafstand in kilometers in. Het systeem vermenigvuldigt dit met 2 voor een retourreis.
                                                </p>
                                            </div>
                                        </Card>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                        <CardContent className="flex justify-end pt-6">
                            <Button type="submit" form="user-edit-form" onClick={() => form.handleSubmit(onSubmit, onInvalid)()} disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                                Wijzigingen Opslaan
                            </Button>
                        </CardContent>
                    </Card>
                </form>
            </Form>
        </div>
    );
}
