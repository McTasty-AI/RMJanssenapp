
"use client";

import { useState, useEffect } from 'react';
import type { User, WeeklyLog as WeeklyLogType, Vehicle } from '@/lib/types';
import { useWeeklyLogs } from '@/hooks/use-weekly-logs';
import { useAdminData } from '@/hooks/use-admin-data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Unlock, FileOutput, CheckCircle, Edit, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { statusTranslations } from '@/lib/types';
import { calculateWorkHours } from '@/hooks/use-weekly-logs';


const downloadWeekAsExcel = (weekData: WeeklyLogType, driver: User) => {
    const driverName = driver ? `${driver.firstName} ${driver.lastName}` : 'Onbekende Chauffeur';
    const formatToLocaleString = (num: number) => num.toFixed(2).replace('.', ',');
    
    // Ensure days array exists
    if (!weekData.days || !Array.isArray(weekData.days) || weekData.days.length === 0) {
        console.error('No days data available for week', weekData.weekId);
        return;
    }
    
    const sheetData = weekData.days.map(day => {
        const workHours = calculateWorkHours(day);
        let dailyHours = 0;
        if(day.status === 'gewerkt') { dailyHours = workHours; }
        else if (day.status !== 'weekend') { dailyHours = 8; }
        
        const totalKm = (day.endMileage ?? 0) - (day.startMileage ?? 0);

        return {
            'Datum': format(new Date(day.date), 'dd-MM-yyyy'), 'Dag': day.day.charAt(0).toUpperCase() + day.day.slice(1), 
            'Kenteken': day.licensePlate || '-',
            'Status': day.status,
            'Begintijd': day.status === 'gewerkt' && day.startTime?.hour ? `${String(day.startTime.hour).padStart(2, '0')}:${String(day.startTime.minute).padStart(2, '0')}` : '-',
            'Eindtijd': day.status === 'gewerkt' && day.endTime?.hour ? `${String(day.endTime.hour).padStart(2, '0')}:${String(day.endTime.minute).padStart(2, '0')}` : '-',
            'Pauze (min)': day.status === 'gewerkt' && (day.breakTime?.hour || day.breakTime?.minute) ? (day.breakTime.hour * 60 + day.breakTime.minute) : '-',
            'Gewerkte Uren': formatToLocaleString(dailyHours),
            'Kilometers': totalKm > 0 ? String(totalKm).replace('.', ',') : '-',
            'Tol': day.toll || 'Geen',
        };
    });

     const totals = weekData.days.reduce(
      (acc, day) => {
        let dailyHours = 0;
        if (day.status === 'gewerkt') {
          dailyHours = calculateWorkHours(day);
          acc.kilometers += (day.endMileage ?? 0) - (day.startMileage ?? 0);
        } else if (day.status !== 'weekend') {
          dailyHours = 8;
        }
        acc.hours += dailyHours;
        return acc;
      },
      { hours: 0, kilometers: 0 }
    );

    const totalsRow = {
        'Datum': 'TOTAAL', 'Dag': '', 'Kenteken': '', 'Status': '', 'Begintijd': '', 'Eindtijd': '', 'Pauze (min)': '',
        'Gewerkte Uren': formatToLocaleString(totals.hours),
        'Kilometers': formatToLocaleString(totals.kilometers),
        'Tol': ''
    };
    
    const ws_data = [
        ['Chauffeur:', driverName],
        ['Week:', weekData.weekId],
        ['Algemene opmerkingen:', weekData.remarks || ''],
        [],
        Object.keys(sheetData[0]),
        ...sheetData.map(row => Object.values(row).map(String)),
        Object.values(totalsRow).map(String)
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Weekstaat");
    XLSX.writeFile(wb, `Weekstaat_${driverName.replace(/ /g,"_")}_${weekData.weekId}.xlsx`);
};

const WeekstateAccordion = ({ log, allUsers, onUnlock, onApprove, onDownload }: { log: WeeklyLogType, allUsers: User[], onUnlock: (weekId: string, driverUid: string) => void, onApprove: (log: WeeklyLogType) => Promise<boolean>, onDownload: (log: WeeklyLogType) => void }) => {
    
    const driver = allUsers.find((u: User) => u.uid === log.userId);
    const driverName = driver ? `${driver.firstName} ${driver.lastName}` : 'Onbekende Chauffeur';
    
    let weekNumber, year;
    try {
        const [parsedYear, parsedWeek] = log.weekId.split('-').map(Number);
        weekNumber = parsedWeek;
        year = parsedYear;
    } catch (error) {
        weekNumber = 0;
        year = 0;
    }

    const logStatus = log.status || 'concept';
    const isPending = logStatus === 'pending';
    const isApproved = logStatus === 'approved';

    const statusBadge = () => {
        switch (logStatus) {
            case 'pending':
                return <Badge variant="secondary" className="h-6"><Edit className="mr-1 h-3 w-3" />In behandeling</Badge>;
            case 'approved':
                return <Badge variant="success" className="h-6"><CheckCircle className="mr-1 h-3 w-3" />Goedgekeurd</Badge>;
            default:
                return <Badge variant="outline" className="h-6"><Edit className="mr-1 h-3 w-3" />Concept</Badge>;
        }
    };
    
    return (
        <AccordionItem value={`${log.weekId}-${log.userId}`} key={`${log.weekId}-${log.userId}`}>
            <AccordionTrigger>
                <div className="flex justify-between items-center w-full pr-4">
                    <div className="flex items-center gap-4">
                        <span>Week {weekNumber} - {year}</span>
                        {statusBadge()}
                    </div>
                    <span className="text-sm text-muted-foreground">{driverName}</span>
                </div>
            </AccordionTrigger>
            <AccordionContent>
                <div className="p-4 bg-muted/30 rounded-md">
                    <p className="mb-4"><strong>Algemene Opmerkingen:</strong> {log.remarks || 'Geen'}</p>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Dag</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Uren</TableHead>
                                <TableHead>KM</TableHead>
                                <TableHead>Tol</TableHead>
                                <TableHead>Overnachting</TableHead>
                                <TableHead>Kenteken</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(log.days || []).map(day => (
                                <TableRow key={day.date}>
                                    <TableCell>{format(parseISO(day.date), 'EEE dd-MM', {locale: nl})}</TableCell>
                                    <TableCell>{day.status}</TableCell>
                                    <TableCell>{calculateWorkHours(day).toFixed(2)}</TableCell>
                                    <TableCell>{(day.endMileage ?? 0) - (day.startMileage ?? 0)}</TableCell>
                                    <TableCell>{day.toll}</TableCell>
                                    <TableCell>{day.overnightStay ? 'Ja' : 'Nee'}</TableCell>
                                    <TableCell>{day.licensePlate || '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <div className="flex gap-2 mt-4">
                       {isPending && <Button onClick={async () => await onApprove(log)}><CheckCircle className="mr-2 h-4 w-4"/>Goedkeuren</Button>}
                       {isApproved && <Button variant="secondary" onClick={() => onDownload(log)}><Download className="mr-2 h-4 w-4" />Download Excel</Button>}
                       {(log.userId && (isPending || isApproved)) && <Button variant="secondary" onClick={() => onUnlock(log.weekId, log.userId)}>
                            <Unlock className="mr-2 h-4 w-4" />
                            Ontgrendel
                       </Button>}
                    </div>
                </div>
            </AccordionContent>
        </AccordionItem>
    );
};

const ApprovalViewer = ({ allLogs, users, loading, onApprove, onUnlock, onDownload }: { allLogs: WeeklyLogType[], users: User[], loading: boolean, onApprove: (log: WeeklyLogType) => Promise<boolean>, onUnlock: (weekId: string, driverUid: string) => void, onDownload: (log: WeeklyLogType) => void }) => {
    const pendingLogs = allLogs.filter(log => log.status === 'pending');

    return (
        <div className="space-y-4">
             {loading ? (
                    <div className="space-y-2 pt-4">
                       <Skeleton className="h-12 w-full" />
                       <Skeleton className="h-12 w-full" />
                       <Skeleton className="h-12 w-full" />
                    </div>
                ) : pendingLogs.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                        {pendingLogs.map(log => (
                            <WeekstateAccordion
                                key={`${log.weekId}-${log.userId}`}
                                log={log}
                                allUsers={users}
                                onUnlock={onUnlock}
                                onApprove={onApprove}
                                onDownload={onDownload}
                            />
                        ))}
                    </Accordion>
                ) : (
                    <p className="text-muted-foreground pt-4 text-center">Geen weekstaten om goed te keuren.</p>
                )
            }
        </div>
    );
};

const PlateLogViewer = ({ allLogs, users, vehicles, loading, onUnlock, onDownload }: { allLogs: WeeklyLogType[], users: User[], vehicles: Vehicle[], loading: boolean, onUnlock: (weekId: string, driverUid: string) => void, onDownload: (log: WeeklyLogType) => void }) => {
    const [selectedPlate, setSelectedPlate] = useState<string>('');
    
    const approvedLogs = allLogs.filter(log => log.status === 'approved');
    const logsForPlate = selectedPlate ? approvedLogs.filter(log => {
        if (!log.days || !Array.isArray(log.days)) return false;
        return log.days.some(day => day.licensePlate && day.licensePlate.trim().toUpperCase() === selectedPlate.trim().toUpperCase());
    }) : [];

    return (
        <div className="space-y-4">
            <div className="max-w-xs">
                <Select value={selectedPlate} onValueChange={setSelectedPlate}>
                    <SelectTrigger>
                        <SelectValue placeholder="Kies een kenteken..." />
                    </SelectTrigger>
                    <SelectContent>
                        {vehicles
                            .filter(v => {
                                if (!v.licensePlate) return false;
                                // Include vehicles with status "Actief" (case-insensitive) or no status
                                if (!v.status) return true;
                                return v.status.toLowerCase() === 'actief';
                            })
                            .map(v => (
                                <SelectItem key={v.id} value={v.licensePlate}>{v.licensePlate}</SelectItem>
                            ))}
                    </SelectContent>
                </Select>
            </div>
            
            {selectedPlate && (
                loading ? (
                    <div className="space-y-2 pt-4">
                       <Skeleton className="h-12 w-full" />
                       <Skeleton className="h-12 w-full" />
                       <Skeleton className="h-12 w-full" />
                    </div>
                ) : logsForPlate.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                        {logsForPlate.map(log => (
                            <WeekstateAccordion
                                key={`${log.weekId}-${log.userId}`}
                                log={log}
                                allUsers={users}
                                onUnlock={onUnlock}
                                onApprove={async () => false}
                                onDownload={onDownload}
                            />
                        ))}
                    </Accordion>
                ) : (
                    <p className="text-muted-foreground pt-4">Geen goedgekeurde weekstaten gevonden voor dit kenteken.</p>
                )
            )}
        </div>
    )
}

const UserLogViewer = ({ allLogs, users, loading, onUnlock, onDownload }: { allLogs: WeeklyLogType[], users: User[], loading: boolean, onUnlock: (weekId: string, driverUid: string) => void, onDownload: (log: WeeklyLogType) => void }) => {
    const [selectedUser, setSelectedUser] = useState<string>('');

    const approvedLogs = allLogs.filter(log => log.status === 'approved');
    const logsForUser = selectedUser ? approvedLogs.filter(log => log.userId === selectedUser) : [];

    return (
        <div className="space-y-4">
            <div className="max-w-xs">
                 <Select value={selectedUser} onValueChange={setSelectedUser} disabled={loading || users.length === 0}>
                    <SelectTrigger>
                        <SelectValue placeholder="Kies een gebruiker..." />
                    </SelectTrigger>
                    <SelectContent>
                        {users.map(user => (
                            <SelectItem key={user.uid} value={user.uid!}>{user.firstName} {user.lastName}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            
            {selectedUser && (
                loading ? (
                    <div className="space-y-2 pt-4">
                       <Skeleton className="h-12 w-full" />
                       <Skeleton className="h-12 w-full" />
                       <Skeleton className="h-12 w-full" />
                    </div>
                ) : logsForUser.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                        {logsForUser.map(log => (
                            <WeekstateAccordion
                                key={`${log.weekId}-${log.userId}`}
                                log={log}
                                allUsers={users}
                                onUnlock={onUnlock}
                                onApprove={async () => false}
                                onDownload={onDownload}
                            />
                        ))}
                    </Accordion>
                ) : (
                    <p className="text-muted-foreground pt-4">Geen goedgekeurde weekstaten gevonden voor deze gebruiker.</p>
                )
            )}
        </div>
    )
}

export default function AdminWeekstatesPage() {
  const { users, logs: dataLogs, vehicles, loading } = useAdminData();
  const { unlockLog, approveLog } = useWeeklyLogs();
  const { toast } = useToast();
  
  // Local state for optimistic updates
  const [logs, setLogs] = useState<WeeklyLogType[]>(dataLogs);
  
  // Sync local state with data from useAdminData
  useEffect(() => {
    setLogs(dataLogs);
  }, [dataLogs]);

   const handleApprove = async (log: WeeklyLogType): Promise<boolean> => {
        const driver = users.find((u: User) => u.uid === log.userId);
        if (!driver) {
            toast({ variant: 'destructive', title: 'Fout', description: 'Chauffeur niet gevonden.'});
            return false;
        }

        // Optimistic update: immediately update status to approved
        setLogs(prev => prev.map(l => 
            l.weekId === log.weekId && l.userId === log.userId 
                ? { ...l, status: 'approved' }
                : l
        ));

        const success = await approveLog(log);
        
        if (success) {
            downloadWeekAsExcel(log, driver);
            // Trigger header refresh
            window.dispatchEvent(new CustomEvent('admin-action-completed'));
            return true;
        } else {
            // Revert optimistic update on error
            setLogs(prev => prev.map(l => 
                l.weekId === log.weekId && l.userId === log.userId 
                    ? { ...l, status: log.status }
                    : l
            ));
        }
        
        return false;
    };
    
    const handleUnlock = async (weekId: string, driverUid: string) => {
        const driver = users.find((u: User) => u.uid === driverUid);
        if(!driver) return;
        
        // Optimistic update: immediately update status to concept
        setLogs(prev => prev.map(l => 
            l.weekId === weekId && l.userId === driverUid 
                ? { ...l, status: 'concept' }
                : l
        ));
        
        try {
            await unlockLog(weekId, driverUid);
            toast({
                title: "Weekstaat ontgrendeld",
                description: `De weekstaat ${weekId} voor ${driver.firstName} is ontgrendeld en teruggezet naar concept.`
            });
        } catch (error: any) {
            // Revert optimistic update on error
            const originalLog = dataLogs.find(l => l.weekId === weekId && l.userId === driverUid);
            if (originalLog) {
                setLogs(prev => prev.map(l => 
                    l.weekId === weekId && l.userId === driverUid 
                        ? { ...l, status: originalLog.status }
                        : l
                ));
            }
            toast({
                variant: 'destructive',
                title: "Fout bij ontgrendelen",
                description: `Er is een fout opgetreden: ${error.message || 'Onbekende fout'}.`
            });
        }
    };
    
    const handleDownload = (log: WeeklyLogType) => {
         const driver = users.find((u: User) => u.uid === log.userId);
         if (driver) {
             downloadWeekAsExcel(log, driver);
         }
    }


  const handleMasterExport = () => {
    if (loading) {
        toast({ title: "Even geduld", description: "De data wordt nog geladen." });
        return;
    }
    
    const approvedLogs = logs.filter(log => log.status === 'approved');

    const wb = XLSX.utils.book_new();

    const legend_data = [
        ["Legenda Urenberekening"],
        [],
        ["Status", "Uitleg"],
        [statusTranslations.gewerkt, "Uren zoals ingevuld door de gebruiker."],
        [statusTranslations.ziek, "Telt als 8 uur per dag."],
        [statusTranslations.vrij, "Telt als 8 uur per dag."],
        [statusTranslations.atv, "Telt als 8 uur per dag."],
        [statusTranslations.ouderschapsverlof, "Telt als 8 uur per dag."],
        [statusTranslations.feestdag, "Telt als 0 uur."],
        [statusTranslations.weekend, "Telt als 0 uur."]
    ];
    const legend_ws = XLSX.utils.aoa_to_sheet(legend_data);
    XLSX.utils.book_append_sheet(wb, legend_ws, "Legenda");


    const dayNames = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
    
    users.forEach(user => {
        const userLogs = approvedLogs
          .filter(log => log.userId === user.uid)
          .sort((a,b) => a.weekId.localeCompare(b.weekId));
        
        if (userLogs.length === 0) return;

        const userName = `${user.firstName} ${user.lastName}`;
        const ws_data: (string | number)[][] = [];

        ws_data.push([`Overzicht voor ${userName}`], []); // Title row

        const weekHeaders = ['Gegeven', ...userLogs.map(log => `Week ${log.weekId.split('-')[1]}`)];
        
        ws_data.push(['UREN OVERZICHT']);
        const urenRows: (string | number)[][] = [];
        let totalHoursPerWeek: number[] = new Array(userLogs.length).fill(0);

        dayNames.forEach(dayName => {
            const row: (string | number)[] = [dayName.charAt(0).toUpperCase() + dayName.slice(1)];
            userLogs.forEach((log, weekIndex) => {
                const dayData = log.days?.find(d => d.day.toLowerCase() === dayName);
                let hours = 0;
                if (dayData) {
                    if (dayData.status === 'gewerkt') {
                        hours = calculateWorkHours(dayData);
                    } else if (dayData.status !== 'weekend' && dayData.status !== 'feestdag') {
                        hours = 8;
                    }
                }
                row.push(hours > 0 ? hours.toFixed(2) : '-');
                totalHoursPerWeek[weekIndex] += hours;
            });
            urenRows.push(row);
        });

        const totalHoursRow = ['Totaal per week', ...totalHoursPerWeek.map(h => h > 0 ? h.toFixed(2) : '-')];
        ws_data.push(weekHeaders, ...urenRows, totalHoursRow);
        
        ws_data.push([]); 

        ws_data.push(['KILOMETER OVERZICHT']);
        const kmRows: (string | number)[][] = [];
        let totalKmPerWeek: number[] = new Array(userLogs.length).fill(0);

        dayNames.forEach(dayName => {
            const row: (string | number)[] = [dayName.charAt(0).toUpperCase() + dayName.slice(1)];
            userLogs.forEach((log, weekIndex) => {
                const dayData = log.days?.find(d => d.day.toLowerCase() === dayName);
                const km = (dayData?.endMileage ?? 0) - (dayData?.startMileage ?? 0);
                row.push(km > 0 ? km : '-');
                totalKmPerWeek[weekIndex] += km;
            });
            kmRows.push(row as any);
        });
        
        const totalKmRow: (string | number)[] = ['Totaal per week', ...totalKmPerWeek.map(km => (km > 0 ? km : '-'))];
        ws_data.push(weekHeaders, ...kmRows, totalKmRow);

        const ws = XLSX.utils.aoa_to_sheet(ws_data, { cellStyles: true });
        XLSX.utils.book_append_sheet(wb, ws, userName.substring(0, 31)); // Sheet name max 31 chars
    });

    if (wb.SheetNames.length <= 1) { // Check if only legend sheet exists
        toast({ title: "Geen data", description: "Er is geen goedgekeurde data gevonden om te exporteren." });
        return;
    }

    XLSX.writeFile(wb, "Master_Overzicht_Goedgekeurd.xlsx");
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold">Weekstaten</h1>
                <CardDescription>Keur weekstaten goed, bekijk het archief en exporteer overzichten.</CardDescription>
            </div>
            <Button onClick={handleMasterExport} disabled={loading}>
                <FileOutput className="mr-2 h-4 w-4" />
                Exporteer Goedgekeurd Overzicht
            </Button>
        </CardHeader>
        <CardContent>
            <Tabs defaultValue="approve" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="approve">Goedkeuren</TabsTrigger>
                    <TabsTrigger value="plate">Per Kenteken</TabsTrigger>
                    <TabsTrigger value="user">Per Gebruiker</TabsTrigger>
                </TabsList>
                <TabsContent value="approve" className="pt-4">
                    <ApprovalViewer 
                        allLogs={logs}
                        users={users}
                        loading={loading}
                        onApprove={handleApprove}
                        onUnlock={handleUnlock}
                        onDownload={handleDownload}
                    />
                </TabsContent>
                <TabsContent value="plate" className="pt-4">
                    <PlateLogViewer 
                        allLogs={logs}
                        users={users}
                        vehicles={vehicles}
                        loading={loading}
                        onUnlock={handleUnlock}
                        onDownload={handleDownload}
                    />
                </TabsContent>
                <TabsContent value="user" className="pt-4">
                    <UserLogViewer 
                         allLogs={logs}
                         users={users}
                         loading={loading}
                         onUnlock={handleUnlock}
                         onDownload={handleDownload}
                    />
                </TabsContent>
            </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
