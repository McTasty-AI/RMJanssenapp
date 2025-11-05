
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { UploadCloud, BarChartHorizontal, Settings, Plus, Landmark, Loader2, ArrowRightLeft, Euro, Calendar as CalendarIcon, Save } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/client';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';


interface ParsedTransaction {
  date: string;
  amount: number;
  description: string;
  reference?: string;
  name?: string;
  iban?: string;
  type?: string;
  authId?: string;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
};

const processDescription = (descLines: string[]): Partial<ParsedTransaction> => {
    if (descLines.length === 0) return {};
    
    const fullText = descLines.map(line => line.replace(/^:86:/, '')).join(' ').trim();
    const data: Record<string, string> = {};
    
    // Pattern to capture KEY: VALUE pairs, where value can contain spaces and special characters.
    // It stops at the next known field name or end of string.
    const fields = ['NAAM', 'OMSCHRIJVING', 'IBAN', 'KENMERK', 'MACHTIGING', 'REMI', 'ORDP'];
    let remainingText = fullText;

    fields.forEach(field => {
        // More robust regex to handle complex values
        const regex = new RegExp(`(?:${field}:|/${field}/)\\s*((?:(?!\\s*(?:${fields.join('|')}):|\\s*/(?:${fields.join('|')})/ ).)*)`);
        const match = remainingText.match(regex);
        
        if (match && match[1]) {
            data[field] = match[1].trim();
            remainingText = remainingText.replace(match[0], ''); // Remove the matched part
        }
    });

    // Assign parsed data to transaction fields
    const name = data['NAAM'] || data['ORDP'];
    const description = data['OMSCHRIJVING'] || data['REMI'] || remainingText.replace(/\s{2,}/g, ' ').trim();
    const iban = data['IBAN'];
    const reference = data['KENMERK'];
    const authId = data['MACHTIGING'];

    let type = 'Onbekend';
    if (fullText.includes('SEPA OVERBOEKING')) type = 'SEPA Overboeking';
    else if (fullText.includes('SEPA INCASSO ALGEMEEN DOORLOPEND')) type = 'SEPA Incasso';
    else if (fullText.includes('SEPA IDEAL')) type = 'iDEAL';
    else if (fullText.includes('SEPA INCASSO B2B DOORLOPEND')) type = 'SEPA Incasso B2B';


    return {
      description: description,
      name: name,
      iban: iban,
      type: type,
      authId: authId,
      reference: reference
    };
};


const parseMt940Content = (content: string): ParsedTransaction[] => {
    const transactions: ParsedTransaction[] = [];
    const lines = content.split(/\r?\n/);

    let currentTransaction: Partial<ParsedTransaction> | null = null;
    let descriptionBuffer: string[] = [];
    
    const saveCurrentTransaction = () => {
        if (currentTransaction && currentTransaction.date && currentTransaction.amount !== undefined) {
             const parsedInfo = processDescription(descriptionBuffer);
             currentTransaction = { ...currentTransaction, ...parsedInfo };
             transactions.push(currentTransaction as ParsedTransaction);
        }
        currentTransaction = null;
        descriptionBuffer = [];
    };


    for (const line of lines) {
        if (line.startsWith(':61:')) {
            if (currentTransaction) {
                 saveCurrentTransaction();
            }

            currentTransaction = {};
            const match = line.match(/^:61:(\d{2})(\d{2})(\d{2})\d*([CD])([\d,]+)/);
            if (match) {
                const year = `20${match[1]}`;
                const month = match[2];
                const day = match[3];
                currentTransaction.date = `${year}-${month}-${day}`;
                
                let amount = parseFloat(match[5].replace(',', '.'));
                if (match[4] === 'D') {
                    amount *= -1;
                }
                currentTransaction.amount = amount;
                
                 const refMatch = line.match(/N\w{3}([A-Z0-9]{1,16})$/);
                 if (refMatch && refMatch[1] && refMatch[1] !== 'NONREF') {
                   currentTransaction.reference = refMatch[1];
                 }
            }
        } else if (line.startsWith(':86:') && currentTransaction) {
            descriptionBuffer.push(line);
        }
    }
    
    if (currentTransaction) {
        saveCurrentTransaction(); // Save the very last transaction
    }
    
    return transactions;
}


export default function BankPage() {
    const [isUploading, setIsUploading] = useState(false);
    const [isSavingBalance, setIsSavingBalance] = useState(false);
    const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
    const [startBalance, setStartBalance] = useState<number | ''>('');
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const { toast } = useToast();
    
     useEffect(() => {
        const fetchFinancials = async () => {
            const { data, error } = await supabase
              .from('financial_settings')
              .select('*')
              .eq('id', 'main')
              .maybeSingle();
            if (error) { console.error('Error fetching financial settings:', error); return; }
            if (data) {
              setStartBalance(typeof data.start_balance === 'number' ? data.start_balance : '');
              if (data.start_date) {
                setStartDate(parseISO(data.start_date));
              }
            }
        };
        fetchFinancials();
    }, []);

    const handleSaveBalance = async () => {
        if (startBalance === '' || !startDate) {
            toast({ variant: 'destructive', title: 'Onvolledige invoer', description: 'Vul zowel een saldo als een datum in.' });
            return;
        }
        setIsSavingBalance(true);
        try {
            const { error } = await supabase
              .from('financial_settings')
              .upsert({ id: 'main', start_balance: Number(startBalance), start_date: format(startDate, 'yyyy-MM-dd') }, { onConflict: 'id' });
            if (error) throw error;
            toast({ title: 'Beginsaldo opgeslagen', description: 'De financiële gegevens zijn bijgewerkt.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Opslaan mislukt' });
            console.error("Error saving financials:", error);
        } finally {
            setIsSavingBalance(false);
        }
    };


    const processFile = async (file: File) => {
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
             toast({ variant: 'destructive', title: 'Bestand te groot', description: 'Het bestand mag maximaal 10 MB zijn.' });
             return;
        }

        setIsUploading(true);
        try {
            const content = await file.text();
            const result = parseMt940Content(content);
            setTransactions(result);
            toast({ title: 'Transacties succesvol ingelezen', description: `${result.length} transacties gevonden.` });
        } catch (error: any) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Inlezen mislukt', description: error.message || 'Er is een onverwachte fout opgetreden bij het verwerken van het bestand.' });
        } finally {
            setIsUploading(false);
        }
    };
    
    const handleFileChange = (files: FileList | null) => {
        if (files && files.length > 0) {
            processFile(files[0]);
        }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
            processFile(event.dataTransfer.files[0]);
            event.dataTransfer.clearData();
        }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    };

    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Banktransacties</h1>
                    <p className="text-muted-foreground">Importeer transacties om betalingen te koppelen aan facturen.</p>
                </div>
                <div className="flex items-center gap-2">
                     <Select defaultValue="this-year">
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter op datum" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="this-year">Transacties uit dit jaar</SelectItem>
                            <SelectItem value="last-year">Transacties uit vorig jaar</SelectItem>
                            <SelectItem value="all">Alle transacties</SelectItem>
                        </SelectContent>
                    </Select>
                     <Button variant="outline" size="icon"><BarChartHorizontal className="h-4 w-4" /></Button>
                     <Button variant="outline" size="icon"><Settings className="h-4 w-4" /></Button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <Alert className="border-dashed border-2 md:col-span-2">
                    <UploadCloud className="h-4 w-4" />
                    <AlertTitle>Transactiebestand uploaden</AlertTitle>
                    <AlertDescription>
                        <div 
                            className="flex flex-col items-center justify-center p-6 text-center cursor-pointer"
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onClick={() => document.getElementById('file-upload')?.click()}
                        >
                            {isUploading ? (
                                <div className="flex flex-col items-center gap-2">
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                    <p className="text-muted-foreground">Bestand verwerken...</p>
                                </div>
                            ) : (
                                <p className="text-muted-foreground">Sleep een transactiebestand (CAMT.053 of MT940) hiernaartoe of <span className="text-primary font-semibold underline">selecteer er één</span> (Maximaal 10 MB is toegestaan)</p>
                            )}
                            <Input 
                                id="file-upload" 
                                type="file" 
                                className="hidden" 
                                onChange={(e) => handleFileChange(e.target.files)} 
                                accept=".xml,.sta,.940"
                                disabled={isUploading}
                            />
                        </div>
                    </AlertDescription>
                    <div className="text-center mt-2">
                        <Button variant="link" className="text-sm">Wanneer er geen transactiebestand beschikbaar is, kun je handmatig transacties toevoegen</Button>
                    </div>
                </Alert>
                
                <Card>
                    <CardHeader>
                        <CardTitle>Rekening Informatie</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="bg-muted p-3 rounded-full">
                            <Landmark className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="font-semibold">NL51 ABNA 0560 3962 87</p>
                                <p className="text-xs text-muted-foreground">Laatst bijgewerkt: meer dan 4 jaar geleden</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                     <CardHeader>
                        <CardTitle>Financieel Beginsaldo</CardTitle>
                        <CardDescription>Stel hier het startpunt in voor de financiële rapportages.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <Label htmlFor="start-balance">Beginsaldo</Label>
                                <div className="relative">
                                    <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="start-balance"
                                        type="number"
                                        placeholder="10000.00"
                                        value={startBalance}
                                        onChange={(e) => setStartBalance(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="pl-9"
                                    />
                                </div>
                            </div>
                            <div>
                                <Label>Startdatum</Label>
                                 <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                                        >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {startDate ? format(startDate, "PPP", { locale: nl }) : <span>Kies een datum</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                         <Button onClick={handleSaveBalance} disabled={isSavingBalance}>
                            {isSavingBalance ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Beginsaldo Opslaan
                        </Button>
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Ingelezen Transacties ({transactions.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {isUploading ? (
                         Array.from({ length: 5 }).map((_, i) => (
                             <Skeleton key={i} className="h-24 w-full" />
                         ))
                    ) : transactions.length > 0 ? (
                        transactions.map((tx, index) => (
                             <div key={index} className="flex items-start gap-4 p-4 border rounded-lg">
                                <div className="p-3 bg-muted rounded-full mt-1">
                                    <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <p className="font-bold">{tx.name || 'Onbekende naam'}</p>
                                    <p className="text-sm text-muted-foreground">{format(new Date(tx.date), 'dd-MM-yyyy')} - {tx.iban || 'Geen IBAN'}</p>
                                    <p className="text-sm whitespace-pre-wrap">{tx.description}</p>
                                    <p className="text-xs text-muted-foreground">Type: {tx.type}</p>
                                    {tx.reference && <p className="text-xs text-muted-foreground">Betalingskenmerk: {tx.reference}</p>}
                                    {tx.authId && <p className="text-xs text-muted-foreground">Machtigingskenmerk: {tx.authId}</p>}
                                     <div className="pt-2">
                                        <Button variant="outline" size="sm">
                                            <Plus className="mr-2 h-4 w-4" />
                                            Koppel openstaand bedrag
                                        </Button>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg">{formatCurrency(tx.amount)}</p>
                                </div>
                            </div>
                        ))
                    ) : (
                         <div className="text-center h-48 flex items-center justify-center text-muted-foreground">
                            <p>Hier komt een overzicht van de transacties na het uploaden van een bestand.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

        </div>
    );
}
    

    

    

    
