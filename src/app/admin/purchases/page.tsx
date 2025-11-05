

"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { UploadCloud, BarChartHorizontal, Plus, Info, Paperclip, Trash2, Loader2, Bot, FileText, AlertCircle, CheckCircle, Truck, Tag, Clock, Circle, Zap } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
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
import { format, isPast, parseISO, isToday, isFuture, startOfToday, getYear, getQuarter } from 'date-fns';
import { nl } from 'date-fns/locale';
import { supabase } from '@/lib/supabase/client';
import { mapSupabaseToApp } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import type { Supplier, PurchaseInvoiceCategory, PurchaseInvoice as PurchaseInvoiceType, PurchaseInvoiceStatus, PurchaseInvoiceStatusExtended, Vehicle, InvoiceLine } from '@/lib/types';

// Lazy load InvoiceBookingDialog to avoid loading PdfPreview (and pdfjs) on initial page load
const InvoiceBookingDialog = dynamic(() => import('@/components/admin/InvoiceBookingDialog').then(mod => ({ default: mod.InvoiceBookingDialog })), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
});
import { purchaseInvoiceCategories, purchaseInvoiceCategoryTranslations } from '@/lib/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { mapAppToSupabase } from '@/lib/utils';


const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
};

export interface PurchaseInvoice {
    id: string;
    kenmerk: string;
    supplierName: string;
    supplierId?: string;
    invoiceDate: string; // ISO string
    dueDate?: string; // ISO string
    grandTotal: number;
    status: PurchaseInvoiceStatus;
    category?: PurchaseInvoiceCategory;
    licensePlate?: string;
    aiResult?: any;
    ocrResult?: any;
    fileDataUri?: string;
    createdAt: string; // ISO string
}

interface AnalyzingFile {
    name: string;
    progress: number;
}

interface PaymentForecast {
    [date: string]: {
        total: number;
        count: number;
    };
}


const FinancialSummaryBar = ({ summary, counts }: { summary: Record<string, number>, counts: Record<string, number>}) => {
    const total = Object.values(summary).reduce((a, b) => a + b, 0);

    if (total === 0) return null;

    const summaryItems = [
        { status: 'Nieuw', color: 'bg-slate-400', label: 'Nieuw' },
        { status: 'Verwerkt', color: 'bg-orange-500', label: 'Openstaand' },
        { status: 'overdue', color: 'bg-red-500', label: 'Verlopen' },
        { status: 'Betaald', color: 'bg-green-500', label: 'Betaald' },
    ];
    
    return (
        <div className="space-y-3 pt-4">
             <div className="flex h-3 rounded-full overflow-hidden">
                {summaryItems.map(item => (
                    <div
                        key={item.status}
                        className={cn("h-full", item.color)}
                        style={{ width: `${(summary[item.status] / total) * 100}%` }}
                        title={`${item.label}: ${formatCurrency(summary[item.status])}`}
                    />
                ))}
            </div>
            <div className="flex justify-around text-xs text-muted-foreground">
                {summaryItems.map(item => (
                     <div key={item.status} className="flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                        <span>
                            {formatCurrency(summary[item.status] || 0)} {item.label} ({counts[item.status] || 0})
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
};


const PaymentForecastPanel = ({ invoices }: { invoices: PurchaseInvoice[] }) => {
    const forecast = useMemo(() => {
        const today = startOfToday();
        const todayStr = format(today, 'yyyy-MM-dd');

        const payables = invoices.filter(inv => inv.status === 'Verwerkt' && inv.dueDate);
        
        const forecastData = payables.reduce((acc, inv) => {
            let dueDate = parseISO(inv.dueDate!);

            // Group overdue invoices into today
            if (isPast(dueDate) && !isToday(dueDate)) {
                dueDate = today;
            }
            
            const dateStr = format(dueDate, 'yyyy-MM-dd');

            if (!acc[dateStr]) {
                acc[dateStr] = { total: 0, count: 0 };
            }
            acc[dateStr].total += inv.grandTotal;
            acc[dateStr].count += 1;
            
            return acc;
        }, {} as PaymentForecast);

        return Object.entries(forecastData).sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime());

    }, [invoices]);

    return (
        <Card className="bg-muted/30 border-dashed">
            <CardHeader>
                <CardTitle className="text-lg">Betalingsprognose</CardTitle>
                <CardDescription>Overzicht van openstaande betalingen, gegroepeerd per vervaldatum.</CardDescription>
            </CardHeader>
            <CardContent>
                {forecast.length > 0 ? (
                     <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {forecast.map(([date, { total, count }]) => {
                             const isOverdue = isPast(parseISO(date)) && !isToday(parseISO(date));
                             return (
                                <div key={date} className={cn("p-4 border rounded-lg", isOverdue || isToday(parseISO(date)) ? "bg-red-100/50 border-red-200" : "bg-card")}>
                                    <p className={cn("font-bold", isOverdue || isToday(parseISO(date)) ? "text-red-700" : "text-primary")}>
                                        {isToday(parseISO(date)) ? 'Vandaag' : format(parseISO(date), 'EEE dd-MM', {locale: nl})}
                                    </p>
                                    <p className="text-xl font-bold">{formatCurrency(total)}</p>
                                    <p className="text-xs text-muted-foreground">{count} factu(u)r(en)</p>
                                </div>
                             )
                        })}
                    </div>
                ) : (
                    <p className="text-muted-foreground text-center p-4">Geen openstaande betalingen gevonden.</p>
                )}
            </CardContent>
        </Card>
    )
}

const formatLicensePlate = (plate?: string): string | undefined => {
    if (!plate) return undefined;
    const cleaned = plate.replace(/[-\s]/g, '').toUpperCase();
    
    // This is a simplified formatter and might not cover all Dutch formats correctly.
    // It's intended for display consistency.
    if (cleaned.length === 6) {
        // Common formats: XX-99-99, 99-99-XX, 99-XX-99, X-999-XX, XX-999-X etc.
        // A generic XX-XXX-X or X-XXX-XX might be a good middle ground.
        return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 5)}-${cleaned.slice(5, 6)}`;
    }
    return plate;
};

const StatusBadge = ({ status }: { status: 'Nieuw' | 'Verwerkt' | 'Betaald' | 'Verlopen' }) => {
    const statusInfo = {
        Nieuw: { variant: "secondary", icon: <Circle className="h-3 w-3" />, text: "Nieuw" },
        Verwerkt: { variant: "warning", icon: <Clock className="h-3 w-3" />, text: "Verwerkt" },
        Betaald: { variant: "success", icon: <CheckCircle className="h-3 w-3" />, text: "Betaald" },
        Verlopen: { variant: "destructive", icon: <AlertCircle className="h-3 w-3" />, text: "Verlopen" },
    }[status];

    return (
        <Badge variant={statusInfo.variant as any} className="flex items-center gap-1.5 capitalize">
            {statusInfo.icon}
            {statusInfo.text}
        </Badge>
    );
};


export default function PurchasesPage() {
    const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
    const [invoicesToDelete, setInvoicesToDelete] = useState<string[] | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [useOCR, setUseOCR] = useState(true); // Default: use OCR (free)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [analyzingFiles, setAnalyzingFiles] = useState<AnalyzingFile[]>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
    const [isBookDialogOpen, setIsBookDialogOpen] = useState(false);
    const [showForecast, setShowForecast] = useState(false);
    const [activeFilter, setActiveFilter] = useState<PurchaseInvoiceStatusExtended>('all');
    
    const { toast } = useToast();
    
    const suppliersKvkMap = useMemo(() => new Map(suppliers.filter(s => s.kvkNumber).map(s => [s.kvkNumber!, s.id])), [suppliers]);
    const suppliersNameMap = useMemo(() => new Map(suppliers.map(s => [s.companyName, s.id])), [suppliers]);

    // Fetch invoices function - made available outside useEffect for manual refresh
    const fetchInvoices = useCallback(async () => {
        const { data, error } = await supabase
            .from('purchase_invoices')
            .select(`
                *,
                purchase_invoice_lines(*),
                suppliers:supplier_id(company_name)
            `)
            .order('created_at', { ascending: false });
        if (error) { 
            console.error('Error fetching purchase invoices:', error); 
            toast({ variant: 'destructive', title: 'Fout bij ophalen inkoopfacturen' }); 
            return;
        }
        
        // Generate PDF URLs and reconstruct OCR results
        const mapped = await Promise.all((data || []).map(async (r) => {
            let fileDataUri: string | undefined = undefined;
            
            // Generate signed URL for PDF if pdf_path exists
            if (r.pdf_path) {
                try {
                    const { data: urlData } = await supabase.storage
                        .from('purchase_invoices')
                        .createSignedUrl(r.pdf_path, 3600); // 1 hour expiry
                    if (urlData?.signedUrl) {
                        fileDataUri = urlData.signedUrl;
                    }
                } catch (err) {
                    console.error('Error generating PDF URL:', err);
                }
            }
            
            // Get supplier name from relation or OCR data
            const supplierNameFromRelation = (r.suppliers as any)?.company_name || '';
            const ocrData = r.ocr_data as any;
            
            // Use supplier name from relation if available, otherwise from OCR data
            const supplierName = supplierNameFromRelation || ocrData?.supplierName || '';
            
            // Reconstruct OCR result from stored OCR data or from database fields
            const ocrResult: any = ocrData ? {
                // Use OCR data if available (preserves original extraction)
                supplierName: ocrData.supplierName || supplierName || undefined,
                invoiceNumber: ocrData.invoiceNumber || r.invoice_number || undefined,
                invoiceDate: ocrData.invoiceDate || r.invoice_date || undefined,
                dueDate: ocrData.dueDate || r.due_date || undefined,
                grandTotal: ocrData.grandTotal || Number(r.total) || 0,
                vatTotal: ocrData.vatTotal || Number(r.vat_total) || undefined,
                subTotal: ocrData.subTotal || (r.vat_total && r.total ? Number(r.total) - Number(r.vat_total) : undefined),
                isDirectDebit: ocrData.isDirectDebit || false,
                lines: ocrData.lines || (r.purchase_invoice_lines || []).map((line: any) => ({
                    description: line.description,
                    quantity: Number(line.quantity) || 1,
                    unitPrice: Number(line.unit_price) || 0,
                    total: Number(line.total) || 0,
                    vatRate: Number(line.vat_rate) || 21,
                    licensePlate: r.license_plate || null, // License plate from invoice (applied to all lines)
                })),
            } : {
                // Fallback: reconstruct from database fields if no OCR data
                supplierName: supplierName || undefined,
                invoiceNumber: r.invoice_number || undefined,
                invoiceDate: r.invoice_date || undefined,
                dueDate: r.due_date || undefined,
                grandTotal: Number(r.total) || 0,
                vatTotal: Number(r.vat_total) || undefined,
                subTotal: r.vat_total && r.total ? Number(r.total) - Number(r.vat_total) : undefined,
                isDirectDebit: false,
                lines: (r.purchase_invoice_lines || []).map((line: any) => ({
                    description: line.description,
                    quantity: Number(line.quantity) || 1,
                    unitPrice: Number(line.unit_price) || 0,
                    total: Number(line.total) || 0,
                    vatRate: Number(line.vat_rate) || 21,
                    licensePlate: r.license_plate || null,
                })),
            };
            
            return {
                id: r.id,
                kenmerk: r.invoice_number || r.id,
                supplierId: r.supplier_id || undefined,
                supplierName: supplierName,
                invoiceDate: r.invoice_date || new Date().toISOString(),
                dueDate: r.due_date || undefined,
                grandTotal: Number(r.total) || 0,
                status: r.status,
                category: r.category || undefined,
                licensePlate: r.license_plate || undefined,
                aiResult: ocrResult, // OCR results (backwards compatible)
                ocrResult: ocrResult,
                fileDataUri: fileDataUri,
                createdAt: r.created_at,
            } as PurchaseInvoice;
        }));
        
        setInvoices(mapped);
    }, [toast]);

    useEffect(() => {
        setLoading(true);
        let done = 0; const tick = () => { done++; if (done === 3) setLoading(false); };

        const fetchInvoicesWrapper = async () => {
            await fetchInvoices();
            tick();
        };

        const fetchSuppliers = async () => {
            const { data } = await supabase.from('suppliers').select('*');
            setSuppliers(((data || []).map(row => mapSupabaseToApp<Supplier>(row))));
            tick();
        };

        const fetchVehicles = async () => {
            const { data } = await supabase.from('vehicles').select('*');
            setVehicles(((data || []).map(row => mapSupabaseToApp<Vehicle>(row))).filter(v => v.status !== 'Inactief' && v.status !== 'Verkocht'));
            tick();
        };

        fetchInvoicesWrapper(); fetchSuppliers(); fetchVehicles();
        const subs = [
            supabase.channel('pi_list').on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_invoices' }, () => {
                // Refresh invoices when changes occur
                fetchInvoicesWrapper();
            }).subscribe(),
            supabase.channel('suppliers_list').on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, fetchSuppliers).subscribe(),
            supabase.channel('vehicles_list').on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, fetchVehicles).subscribe(),
        ];
        return () => { subs.forEach(ch => ch.unsubscribe()); };
    }, [toast, fetchInvoices]);

    // Fill supplier names once both invoices and suppliers are loaded
    // Note: Supplier names are already loaded via the relation in fetchInvoices, 
    // but we ensure they're updated if suppliers change
    useEffect(() => {
        if (!suppliers || suppliers.length === 0 || invoices.length === 0) return;
        const supplierMap = new Map(suppliers.map(s => [s.id, s.companyName]));
        setInvoices(prev => prev.map(inv => ({
            ...inv,
            // Use supplier name from relation if available, otherwise look it up
            supplierName: inv.supplierName || (inv.supplierId ? (supplierMap.get(inv.supplierId) || '') : inv.supplierName),
            // Also update aiResult with supplier name if missing
            aiResult: inv.aiResult ? {
                ...inv.aiResult,
                supplierName: inv.aiResult.supplierName || inv.supplierName || (inv.supplierId ? (supplierMap.get(inv.supplierId) || '') : undefined),
            } : inv.aiResult,
        })));
    }, [suppliers, invoices.length]);
    
    // This effect ensures that if the selected invoice (which is open in the dialog)
    // is updated in the main `invoices` list, the `selectedInvoice` state is also updated.
    useEffect(() => {
        if (selectedInvoice) {
            const updatedInvoice = invoices.find(inv => inv.id === selectedInvoice.id);
            if (updatedInvoice) {
                setSelectedInvoice(updatedInvoice);
            }
        }
    }, [invoices, selectedInvoice]);

    const { filteredInvoices, financialSummary, financialCounts } = useMemo(() => {
        const summary = { 'Nieuw': 0, 'Verwerkt': 0, 'Betaald': 0, 'overdue': 0 };
        const counts = { 'Nieuw': 0, 'Verwerkt': 0, 'Betaald': 0, 'overdue': 0 };
        
        invoices.forEach(inv => {
            const isOverdue = inv.status === 'Verwerkt' && inv.dueDate && isPast(parseISO(inv.dueDate));
            const statusKey = isOverdue ? 'overdue' : inv.status;
            
            if (summary.hasOwnProperty(statusKey)) {
                summary[statusKey] += inv.grandTotal;
                counts[statusKey]++;
            }
            
            if (statusKey === 'overdue') {
                // Also add to the 'Verwerkt' total for the bar chart display logic
                 summary['Verwerkt'] += inv.grandTotal;
                 counts['Verwerkt']++;
            }
        });
        
        let filtered = invoices;
        if (activeFilter === 'all') {
            filtered = invoices;
        } else if (activeFilter === 'overdue') {
            filtered = invoices.filter(inv => inv.status === 'Verwerkt' && inv.dueDate && isPast(parseISO(inv.dueDate)));
        } else {
            filtered = invoices.filter(inv => inv.status === activeFilter);
        }

        return { filteredInvoices: filtered, financialSummary: summary, financialCounts: counts };
    }, [invoices, activeFilter]);


    const handleRowClick = (invoiceId: string) => {
        const invoiceData = invoices.find(inv => inv.id === invoiceId);
        if (invoiceData) {
            setSelectedInvoice(invoiceData);
            setIsBookDialogOpen(true);
        }
    };


    const handleSelectAll = (checked: boolean | 'indeterminate') => {
        if (checked === true) {
            setSelectedInvoices(filteredInvoices.map(inv => inv.id));
        } else {
            setSelectedInvoices([]);
        }
    };

    const handleSelectRow = (invoiceId: string, checked: boolean) => {
        if (checked) {
            setSelectedInvoices(prev => [...prev, invoiceId]);
        } else {
            setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
        }
    };
    
    const handleDeleteClick = (invoiceId: string) => {
        setInvoicesToDelete([invoiceId]);
    };

    const handleBulkDelete = () => {
        setInvoicesToDelete(selectedInvoices);
    }
    
    const handleMarkAsPaid = async () => {
        setIsUpdatingStatus(true);
        try {
            const { error } = await supabase
                .from('purchase_invoices')
                .update({ status: 'Betaald' })
                .in('id', selectedInvoices);
            if (error) throw error;
            toast({ title: `${selectedInvoices.length} factu(u)r(en) als betaald gemarkeerd` });
            setSelectedInvoices([]);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Status bijwerken mislukt' });
        } finally {
            setIsUpdatingStatus(false);
        }
    };


    const handleConfirmDelete = async () => {
        if (!invoicesToDelete) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from('purchase_invoices')
                .delete()
                .in('id', invoicesToDelete);
            if (error) throw error;
            toast({ title: 'Factuur(en) verwijderd' });
        } catch (error) {
            console.error('Error deleting invoices:', error);
            toast({ variant: 'destructive', title: 'Verwijderen mislukt' });
        } finally {
            setIsDeleting(false);
            setInvoicesToDelete(null);
            setSelectedInvoices([]);
        }
    };

    const handleCreateSupplier = async (dataUri: string): Promise<boolean> => {
        try {
            // Convert data URI to File for OCR parsing
            const response = await fetch(dataUri);
            const blob = await response.blob();
            const file = new File([blob], 'invoice.pdf', { type: blob.type });
            
            // Dynamically import OCR parser to avoid loading tesseract.js on page load
            const { parseInvoiceWithOCR } = await import('@/lib/invoice-ocr-parser');
            
            // Parse invoice with OCR to extract supplier info
            const result = await parseInvoiceWithOCR(file);
            
            if (!result.supplierName) {
                toast({ variant: 'destructive', title: 'Leverancier niet gevonden', description: 'Kon leveranciersnaam niet uit factuur halen.' });
                return false;
            }
            
            const supplierName = result.supplierName.trim();
            
            // Check if supplier already exists
            if (suppliersNameMap.has(supplierName)) {
                toast({ variant: 'destructive', title: 'Leverancier bestaat al', description: `Een leverancier met de naam ${supplierName} is al geregistreerd.` });
                return false;
            }
            
            // Create supplier with basic info (OCR can't extract full details like KVK, IBAN, etc.)
            const payload = {
                company_name: supplierName,
                kvk_number: null,
                vat_number: null,
                iban: null,
                street: null,
                house_number: null,
                postal_code: null,
                city: null,
            };
            
            const { error } = await supabase.from('suppliers').insert(payload);
            if (error) throw error;
            
            toast({ title: 'Leverancier aangemaakt', description: `${supplierName} is toegevoegd aan uw leveranciers.` });
            return true;
        } catch (error) {
            console.error('Error creating supplier:', error);
            toast({ variant: 'destructive', title: 'Aanmaken mislukt' });
            return false;
        }
    };

    const handleFileChange = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        
        setIsUploading(true);
        const fileArray = Array.from(files);
        
        // Limit concurrent uploads for better performance
        const MAX_CONCURRENT = 3; // Process max 3 files at a time
        const DELAY_BETWEEN_FILES = 1000; // 1 second delay between files
        
        // Initialize progress tracking for all files
        const initialFiles: AnalyzingFile[] = fileArray.map(file => ({
            name: file.name,
            progress: 0,
        }));
        setAnalyzingFiles(initialFiles);
        
        try {
            // Process files in batches
            for (let batchStart = 0; batchStart < fileArray.length; batchStart += MAX_CONCURRENT) {
                const batch = fileArray.slice(batchStart, batchStart + MAX_CONCURRENT);
                
                // Process batch sequentially (within batch)
                for (let i = 0; i < batch.length; i++) {
                    const fileIndex = batchStart + i;
                    const file = batch[i];
                    
                    // Add delay between files (except the first one)
                    if (fileIndex > 0) {
                        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_FILES));
                    }
                    
                    // Update progress: start processing
                    setAnalyzingFiles(prev => prev.map((f, idx) => 
                        idx === fileIndex ? { ...f, progress: 10 } : f
                    ));
                    
                    let result: any = null;
                    let supplierId: string | null = null;
                    
                    // Parse invoice with OCR if enabled
                    if (useOCR) {
                        // Update progress: starting OCR
                        setAnalyzingFiles(prev => prev.map((f, idx) => 
                            idx === fileIndex ? { ...f, progress: 30 } : f
                        ));
                        
                        // Dynamically import OCR parser to avoid loading tesseract.js on page load
                        const { parseInvoiceWithOCR } = await import('@/lib/invoice-ocr-parser');
                        
                        // Analyze invoice with OCR (free)
                        result = await parseInvoiceWithOCR(file);
                        
                        // Update progress: analyzed
                        setAnalyzingFiles(prev => prev.map((f, idx) => 
                            idx === fileIndex ? { ...f, progress: 50 } : f
                        ));
                    } else {
                        // No analysis - just upload file
                        result = null;
                        setAnalyzingFiles(prev => prev.map((f, idx) => 
                            idx === fileIndex ? { ...f, progress: 50 } : f
                        ));
                    }
                    
                    // Find supplier (only if OCR was used and supplier name found)
                    // Do NOT create supplier automatically - user must do it manually
                    if (useOCR && result?.supplierName) {
                        const supplierName = result.supplierName.trim();
                        const { data: existingSupplier } = await supabase
                            .from('suppliers')
                            .select('id')
                            .eq('company_name', supplierName)
                            .maybeSingle();
                        
                        if (existingSupplier?.id) {
                            supplierId = existingSupplier.id as string;
                        } else {
                            // Check if supplier exists by KVK number (if available)
                            if (result.kvkNumber && suppliersKvkMap.has(result.kvkNumber)) {
                                supplierId = suppliersKvkMap.get(result.kvkNumber)!;
                            }
                            // If no supplier found, supplierId remains null
                            // The supplier name will be available in OCR results for manual creation
                        }
                        
                        // Update progress: supplier checked
                        setAnalyzingFiles(prev => prev.map((f, idx) => 
                            idx === fileIndex ? { ...f, progress: 60 } : f
                        ));
                    }
                    
                    // Upload file to Supabase storage (always done, regardless of AI)
                    const fileExt = file.name.split('.').pop() || 'pdf';
                    const timestamp = Date.now();
                    const storagePath = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                    
                    const { error: uploadError } = await supabase.storage
                        .from('purchase_invoices')
                        .upload(storagePath, file, {
                            contentType: file.type,
                            upsert: false,
                        });
                    
                    if (uploadError) {
                        console.error('Error uploading file:', uploadError);
                        throw uploadError;
                    }
                    
                    // Update progress: file uploaded
                    setAnalyzingFiles(prev => prev.map((f, idx) => 
                        idx === fileIndex ? { ...f, progress: 80 } : f
                    ));
                    
                    // Check for duplicates (only if OCR was used)
                    if (useOCR && supplierId && result?.invoiceNumber && result?.grandTotal) {
                        const { data: dup } = await supabase
                            .from('purchase_invoices')
                            .select('id')
                            .eq('supplier_id', supplierId)
                            .eq('invoice_number', result.invoiceNumber)
                            .eq('total', result.grandTotal)
                            .limit(1);
                        if (dup && dup.length > 0) {
                            setAnalyzingFiles(prev => prev.map((f, idx) => 
                                idx === fileIndex ? { ...f, progress: 100 } : f
                            ));
                            toast({
                                variant: 'destructive',
                                title: 'Dubbele factuur',
                                description: `Factuur ${result.invoiceNumber} van ${result.supplierName} bestaat al.`,
                            });
                            continue;
                        }
                    }
                    
                    // Update progress: ready to save
                    setAnalyzingFiles(prev => prev.map((f, idx) => 
                        idx === fileIndex ? { ...f, progress: 90 } : f
                    ));
                    
                    // Extract license plate from OCR result (from lines or document)
                    let invoiceLicensePlate: string | null = null;
                    if (useOCR && result?.lines && result.lines.length > 0) {
                        // Try to find a license plate in the lines
                        const plates = result.lines
                            .map((l: any) => l.licensePlate)
                            .filter((p: string | undefined) => p && p.trim().length > 0);
                        if (plates.length > 0) {
                            // Use the first found license plate
                            invoiceLicensePlate = plates[0];
                        }
                    }
                    
                    // Store OCR results in database, especially if supplier not found
                    // This preserves supplier name and other OCR data for manual review
                    const ocrData = useOCR && result ? {
                        supplierName: result.supplierName || undefined,
                        invoiceNumber: result.invoiceNumber || undefined,
                        invoiceDate: result.invoiceDate || undefined,
                        dueDate: result.dueDate || undefined,
                        subTotal: result.subTotal || undefined,
                        vatTotal: result.vatTotal || undefined,
                        grandTotal: result.grandTotal || undefined,
                        isDirectDebit: result.isDirectDebit || false,
                        lines: result.lines || [],
                    } : null;
                    
                    // Save invoice to database
                    const invoicePayload = mapAppToSupabase({
                        supplierId: supplierId || null,
                        invoiceNumber: result?.invoiceNumber || null,
                        invoiceDate: result?.invoiceDate || new Date().toISOString().split('T')[0],
                        dueDate: result?.dueDate || null,
                        status: 'Nieuw' as PurchaseInvoiceStatus,
                        total: result?.grandTotal || 0,
                        vatTotal: result?.vatTotal ?? null,
                        licensePlate: invoiceLicensePlate,
                        category: null,
                        pdfPath: storagePath,
                        ocrData: ocrData,
                        createdAt: new Date().toISOString(),
                    });
                    
                    const { data: inserted, error: insErr } = await supabase
                        .from('purchase_invoices')
                        .insert(invoicePayload)
                        .select('*')
                        .single();
                    
                    if (insErr) throw insErr;
                    
                    // Insert invoice lines if present (only if OCR was used)
                    // Note: License plates are stored on the invoice level, not per line
                    // But we keep the license plate info in the OCR results for display
                    if (useOCR && result?.lines && result.lines.length > 0) {
                        const lineRows = result.lines.map((l: any) => ({
                            purchase_invoice_id: inserted.id,
                            description: l.description,
                            quantity: l.quantity ?? 1,
                            unit_price: l.unitPrice ?? 0,
                            vat_rate: l.vatRate ?? 21,
                            total: l.total ?? (l.quantity ?? 1) * (l.unitPrice ?? 0),
                            category: null,
                        }));
                        const { error: linesErr } = await supabase
                            .from('purchase_invoice_lines')
                            .insert(lineRows);
                        if (linesErr) {
                            console.error('Error inserting invoice lines:', linesErr);
                            // Don't fail the entire operation if lines fail
                        }
                    }
                
                    // Update progress: complete
                    setAnalyzingFiles(prev => prev.map((f, idx) => 
                        idx === fileIndex ? { ...f, progress: 100 } : f
                    ));
                }
            }
            
            toast({
                title: 'Facturen geüpload',
                description: useOCR
                    ? `${fileArray.length} factuur(en) succesvol geüpload en geanalyseerd met OCR.`
                    : `${fileArray.length} factuur(en) geüpload. Voeg handmatig de gegevens toe door op de factuur te klikken.`,
            });
            
            // Explicitly refresh invoices after upload to ensure UI updates
            // Small delay to ensure database insert is complete
            setTimeout(async () => {
                await fetchInvoices();
            }, 500);
            
            // Clear analyzing files after a short delay
            setTimeout(() => {
                setAnalyzingFiles([]);
            }, 2000);
            
        } catch (error: any) {
            console.error('Error processing invoices:', error);
            toast({
                variant: 'destructive',
                title: 'Upload mislukt',
                description: error?.message || 'Er is een fout opgetreden bij het uploaden van de facturen.',
            });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        
        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            await handleFileChange(files);
        }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    };

     const handleCategoryChange = async (invoiceId: string, newCategory: PurchaseInvoiceCategory) => {
        try {
            const { error } = await supabase
                .from('purchase_invoices')
                .update({ category: newCategory })
                .eq('id', invoiceId);
            if (error) throw error;
            toast({ title: 'Categorie bijgewerkt', description: 'De factuurcategorie is succesvol gewijzigd.' });
        } catch (error) {
            console.error('Error updating category:', error);
            toast({ variant: 'destructive', title: 'Fout', description: 'Kon de categorie niet bijwerken.' });
        }
    };

    const handlePlateChange = async (invoiceId: string, _lineIndex: number, newPlate: string) => {
        try {
            const { error } = await supabase
                .from('purchase_invoices')
                .update({ license_plate: newPlate === '__none__' ? null : newPlate })
                .eq('id', invoiceId);
            if (error) throw error;
            toast({ title: 'Kenteken bijgewerkt' });
            // Refresh invoices to show updated license plate
            await fetchInvoices();
        } catch (error) {
            console.error('Error updating license plate:', error);
            toast({ variant: 'destructive', title: 'Fout', description: 'Kon het kenteken niet bijwerken.' });
        }
    };

    const handleInvoicePlateChange = async (invoiceId: string, newPlate: string) => {
        try {
            const { error } = await supabase
                .from('purchase_invoices')
                .update({ license_plate: newPlate === '__none__' ? null : newPlate })
                .eq('id', invoiceId);
            if (error) throw error;
            toast({ title: 'Kenteken bijgewerkt' });
            // Refresh invoices to show updated license plate
            await fetchInvoices();
        } catch (error) {
            console.error('Error updating invoice license plate:', error);
            toast({ variant: 'destructive', title: 'Fout', description: 'Kon het kenteken niet bijwerken.' });
        }
    };

    const getSupplierId = (invoice: PurchaseInvoiceType): string | undefined => {
        // Check OCR result first (backwards compatible with aiResult)
        const ocrData = invoice.ocrResult || invoice.aiResult;
        if (ocrData?.kvkNumber && suppliersKvkMap.has(ocrData.kvkNumber)) {
            return suppliersKvkMap.get(ocrData.kvkNumber);
        }
        if (invoice.supplierName && suppliersNameMap.has(invoice.supplierName)) {
            return suppliersNameMap.get(invoice.supplierName);
        }
        return undefined;
    };
    
    const filterOptions: { label: string; value: PurchaseInvoiceStatusExtended }[] = [
        { label: 'Alle', value: 'all' },
        { label: 'Nieuw', value: 'Nieuw' },
        { label: 'Verwerkt', value: 'Verwerkt' },
        { label: 'Verlopen', value: 'overdue' },
        { label: 'Betaald', value: 'Betaald' },
    ];


    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Inkoopfacturen</h1>
                    <p className="text-muted-foreground">Beheer en verwerk hier uw inkoopfacturen.</p>
                </div>
                <div className="flex items-center gap-2">
                     <Button variant="outline" size="icon" onClick={() => setShowForecast(prev => !prev)} className={cn(showForecast && 'bg-accent text-accent-foreground')}><BarChartHorizontal className="h-4 w-4" /></Button>
                     <Button variant="outline">Exporteren</Button>
                     <Button 
                        onClick={() => !isUploading && document.getElementById('file-upload')?.click()}
                        disabled={isUploading}
                    >
                        <Plus className="mr-2 h-4 w-4" /> Toevoegen
                    </Button>
                </div>
            </div>
            
            {showForecast && <PaymentForecastPanel invoices={invoices} />}

             <Alert className="border-dashed border-2">
                 <div className="flex flex-col items-center justify-center p-6 text-center space-y-4">
                    <div className="flex flex-col gap-3 w-full max-w-md">
                        <div className="flex items-center gap-4 justify-center">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="use-ocr-toggle"
                                    checked={useOCR}
                                    onChange={(e) => setUseOCR(e.target.checked)}
                                    disabled={isUploading}
                                    className="h-4 w-4"
                                />
                                <label htmlFor="use-ocr-toggle" className="text-sm cursor-pointer">
                                    OCR-analyse gebruiken
                                </label>
                            </div>
                            {useOCR && (
                                <Badge variant="outline" className="text-xs text-green-600">
                                    ✓ Gratis
                                </Badge>
                            )}
                        </div>
                        {!useOCR && (
                            <p className="text-xs text-muted-foreground">
                                Alleen bestand uploaden zonder analyse. Handmatig invullen via factuurdetails.
                            </p>
                        )}
                    </div>
                    <div
                        className="flex flex-col items-center justify-center cursor-pointer w-full"
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onClick={() => !isUploading && document.getElementById('file-upload')?.click()}
                    >
                        {isUploading ? (
                            <div className="w-full max-w-md mx-auto space-y-2">
                                <p className="text-sm font-semibold">Facturen verwerken...</p>
                                {analyzingFiles.map(file => (
                                    <div key={file.name} className="space-y-1 text-left">
                                         <div className="flex justify-between text-xs text-muted-foreground">
                                            <span className="truncate max-w-[200px]">{file.name}</span>
                                            <span>{Math.round(file.progress)}%</span>
                                        </div>
                                        <Progress value={file.progress} className="w-full h-2" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                             <div className="flex items-center">
                                <UploadCloud className="h-4 w-4 mr-2" />
                                <p className="text-muted-foreground">
                                    {useOCR
                                        ? 'Sleep facturen hierheen of klik om te uploaden (PDF of afbeelding) - OCR analyse ingeschakeld'
                                        : 'Sleep facturen hierheen of klik om te uploaden (PDF of afbeelding) - Handmatige invoer'}
                                </p>
                            </div>
                        )}
                        <Input
                            id="file-upload"
                            type="file"
                            className="hidden"
                            multiple
                            onChange={(e) => handleFileChange(e.target.files)}
                            disabled={isUploading}
                            accept="image/*,.pdf"
                        />
                    </div>
                </div>
            </Alert>
            
            <Card>
                 <CardHeader>
                    <div className="flex justify-between items-center">
                       <div className="grid grid-cols-5 gap-2 w-full max-w-lg">
                            {filterOptions.map(opt => (
                                <Button
                                    key={opt.value}
                                    variant={activeFilter === opt.value ? 'default' : 'outline'}
                                    onClick={() => setActiveFilter(opt.value)}
                                >
                                    {opt.label}
                                </Button>
                            ))}
                       </div>
                    </div>
                     {loading ? (
                         <div className="space-y-3 pt-4">
                            <Skeleton className="h-3 w-full" />
                            <div className="flex justify-around">
                                <Skeleton className="h-4 w-1/4" />
                                <Skeleton className="h-4 w-1/4" />
                                <Skeleton className="h-4 w-1/4" />
                                <Skeleton className="h-4 w-1/4" />
                            </div>
                        </div>
                    ) : (
                        <FinancialSummaryBar summary={financialSummary} counts={financialCounts} />
                    )}
                </CardHeader>
                <CardContent className="p-0">
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">
                                    <Checkbox
                                        checked={filteredInvoices.length > 0 && selectedInvoices.length === filteredInvoices.length}
                                        onCheckedChange={handleSelectAll}
                                        aria-label="Selecteer alle"
                                     />
                                </TableHead>
                                <TableHead>Factuur</TableHead>
                                <TableHead>Leverancier</TableHead>
                                <TableHead>Datums</TableHead>
                                <TableHead className="text-right">Bedrag</TableHead>
                                <TableHead className="w-[100px] text-right">Acties</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><div className="h-8 w-8 flex items-center justify-center"><Skeleton className="h-4 w-4" /></div></TableCell>
                                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24 text-right" /></TableCell>
                                    <TableCell><div className="h-10 w-10 ml-auto flex items-center justify-center"><Skeleton className="h-10 w-10" /></div></TableCell>
                                </TableRow>
                                ))
                            ) : filteredInvoices.length > 0 ? (
                                filteredInvoices.map((invoice) => {
                                    const supplierId = getSupplierId(invoice);
                                    const isOverdue = invoice.status === 'Verwerkt' && invoice.dueDate && isPast(parseISO(invoice.dueDate));
                                    // Get OCR result (backwards compatible with aiResult)
                                    const ocrData = invoice.ocrResult || invoice.aiResult;
                                    const licensePlates = ocrData?.lines?.map((l: InvoiceLine) => l.licensePlate).filter(Boolean) || [];
                                    const uniquePlates = [...new Set(licensePlates)];

                                    return (
                                        <TableRow key={invoice.id} onClick={() => handleRowClick(invoice.id)} className="cursor-pointer">
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={selectedInvoices.includes(invoice.id)}
                                                    onCheckedChange={(checked) => handleSelectRow(invoice.id, !!checked)}
                                                    aria-label={`Selecteer factuur ${invoice.kenmerk}`}
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <StatusBadge status={isOverdue ? 'Verlopen' : invoice.status} />
                                                    <div className="flex flex-col">
                                                        <span>{invoice.kenmerk}</span>
                                                        <span className="text-xs text-muted-foreground">{ocrData?.invoiceNumber || '-'}</span>
                                                    </div>
                                                    {invoice.fileDataUri && (
                                                         <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger>
                                                                     {ocrData?.isDirectDebit ? <Zap className="h-4 w-4 text-blue-500" /> : <Paperclip className="h-4 w-4 text-muted-foreground" />}
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p>{ocrData?.isDirectDebit ? 'Automatische Incasso' : 'Document heeft bijlage(n)'}</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-2">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            {supplierId ? (
                                                                <Link href={`/admin/suppliers/${supplierId}`} onClick={(e) => e.stopPropagation()} className="hover:underline text-primary font-semibold">
                                                                    {invoice.supplierName}
                                                                </Link>
                                                            ) : (
                                                                <span className="font-semibold">{invoice.supplierName}</span>
                                                            )}
                                                            {!supplierId && (
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger>
                                                                            <Info className="h-4 w-4 text-blue-500" />
                                                                        </TooltipTrigger>
                                                                        <TooltipContent>
                                                                            <p>Leverancier niet gevonden.</p>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            )}
                                                        </div>
                                                    </div>
                                                     <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                         {uniquePlates.length > 0 && <Badge variant="outline"><Truck className="h-3 w-3 mr-1" />{uniquePlates.join(', ')}</Badge>}
                                                         <div onClick={e => e.stopPropagation()} className="w-[180px]">
                                                            <Select
                                                                value={invoice.category || ''}
                                                                onValueChange={(newCategory) => handleCategoryChange(invoice.id, newCategory as PurchaseInvoiceCategory)}
                                                            >
                                                                <SelectTrigger className="h-6 text-xs px-2 border-dashed">
                                                                    <SelectValue placeholder="Kies categorie..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {purchaseInvoiceCategories.map(cat => (
                                                                        <SelectItem key={cat} value={cat}>
                                                                            {purchaseInvoiceCategoryTranslations[cat]}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <p>Factuur: {format(new Date(invoice.invoiceDate), 'dd-MM-yyyy')}</p>
                                                    <p className={cn(invoice.dueDate && isPast(parseISO(invoice.dueDate)) && invoice.status !== 'Betaald' && "text-destructive font-semibold")}>
                                                        Verval: {invoice.dueDate ? format(new Date(invoice.dueDate), 'dd-MM-yyyy') : '-'}
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">{formatCurrency(invoice.grandTotal)}</TableCell>
                                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDeleteClick(invoice.id)}
                                                    className="text-muted-foreground hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={10} className="h-24 text-center">
                                        Nog geen inkoopfacturen geüpload.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                {selectedInvoices.length > 0 && (
                    <CardFooter className="p-4 border-t justify-between">
                       <span className="text-sm text-muted-foreground">{selectedInvoices.length} item(s) geselecteerd</span>
                       <div className="flex gap-2">
                           <Button variant="outline" onClick={handleMarkAsPaid} disabled={isUpdatingStatus}>
                                {isUpdatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4" />}
                                Markeer als betaald
                           </Button>
                           <Button variant="destructive" onClick={handleBulkDelete}>Verwijder documenten</Button>
                       </div>
                    </CardFooter>
                )}
            </Card>

            <AlertDialog open={!!invoicesToDelete} onOpenChange={(open) => !open && setInvoicesToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Weet u het zeker?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deze actie kan niet ongedaan worden gemaakt. Dit zal de geselecteerde inkoopfactuur(en) permanent verwijderen.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setInvoicesToDelete(null)}>Annuleren</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Verwijderen'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
             {selectedInvoice && (
                <InvoiceBookingDialog
                    isOpen={isBookDialogOpen}
                    onClose={() => {
                        setIsBookDialogOpen(false);
                        setSelectedInvoice(null);
                    }}
                    invoice={selectedInvoice}
                    suppliers={suppliers}
                    onCreateSupplier={handleCreateSupplier}
                    vehicles={vehicles}
                    onPlateChange={handlePlateChange}
                    onInvoicePlateChange={handleInvoicePlateChange}
                />
            )}
        </div>
    );
}
