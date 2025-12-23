

"use client";

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PdfPreview from '@/components/PdfPreview';
import type { PurchaseInvoice } from '@/app/admin/purchases/page';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, CheckCircle, Tag, Truck, Zap } from 'lucide-react';
import type { Supplier, PurchaseInvoiceCategory, Vehicle } from '@/lib/types';
import { purchaseInvoiceCategories, purchaseInvoiceCategoryTranslations } from '@/lib/types';


const formatCurrency = (value?: number) => {
    if (value === undefined) return '-';
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
};

const InfoRow = ({ label, value, children }: { label: string, value?: string, children?: React.ReactNode }) => (
    <div className="flex justify-between items-center text-sm">
        <p className="text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
            <p className="font-medium text-right">{value || '-'}</p>
            {children}
        </div>
    </div>
);

export function InvoiceBookingDialog({ 
    isOpen, 
    onClose, 
    invoice: initialInvoice, 
    suppliers,
    onCreateSupplier,
    vehicles,
    onPlateChange,
    onInvoicePlateChange
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    invoice: PurchaseInvoice | null, 
    suppliers: Supplier[], 
    onCreateSupplier: (file: File, invoiceId?: string) => Promise<boolean>,
    vehicles: Vehicle[],
    onPlateChange: (invoiceId: string, lineIndex: number, newPlate: string) => void,
    onInvoicePlateChange?: (invoiceId: string, newPlate: string) => void
}) {
    const { toast } = useToast();
    const [invoice, setInvoice] = useState(initialInvoice);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
    const [fileBlob, setFileBlob] = useState<File | null>(null);
    const [supplierExists, setSupplierExists] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<PurchaseInvoiceCategory | ''>('');

    const suppliersKvkMap = useMemo(() => new Map(suppliers.filter(s => s.kvkNumber).map(s => [s.kvkNumber!, s.id])), [suppliers]);
    const suppliersNameMap = useMemo(() => new Map(suppliers.map(s => [s.companyName, s.id])), [suppliers]);
    
    useEffect(() => {
        const getSupplierId = (inv: PurchaseInvoice | null) => {
            if (inv?.aiResult?.kvkNumber && suppliersKvkMap.has(inv.aiResult.kvkNumber)) {
                return suppliersKvkMap.get(inv.aiResult.kvkNumber);
            }
            if (inv?.supplierName && suppliersNameMap.has(inv.supplierName)) {
                return suppliersNameMap.get(inv.supplierName);
            }
            return undefined;
        };

        if(isOpen && initialInvoice) {
             setInvoice(initialInvoice);
             setSupplierExists(!!getSupplierId(initialInvoice));
             setSelectedCategory(initialInvoice.category || '');
        }

        if (isOpen && initialInvoice?.fileDataUri) {
            // Fetch PDF from signed URL and create File object
            fetch(initialInvoice.fileDataUri)
                .then(res => {
                    if (!res.ok) {
                        throw new Error(`Failed to fetch PDF: ${res.status} ${res.statusText}`);
                    }
                    return res.blob();
                })
                .then(blob => {
                    console.log('PDF blob loaded:', {
                        size: blob.size,
                        type: blob.type,
                        url: initialInvoice.fileDataUri
                    });
                    
                    // Ensure blob type is correct
                    const mimeType = blob.type || 'application/pdf';
                    const file = new File([blob], "invoice.pdf", { type: mimeType });
                    setFileBlob(file);
                })
                .catch(error => {
                    console.error('Error loading PDF file:', error);
                    toast({
                        variant: 'destructive',
                        title: 'PDF kan niet worden geladen',
                        description: 'Het PDF bestand kon niet worden ingelezen. Controleer of het bestand bestaat en toegankelijk is.',
                    });
                    setFileBlob(null);
                });
        } else if (isOpen && initialInvoice) {
            // If no fileDataUri, try to generate signed URL from pdf_path
            const loadPdfFromPath = async () => {
                if (!initialInvoice.id) return;
                
                try {
                    // Fetch invoice to get pdf_path
                    const { data: invoiceData, error } = await supabase
                        .from('purchase_invoices')
                        .select('pdf_path')
                        .eq('id', initialInvoice.id)
                        .single();
                    
                    if (error || !invoiceData?.pdf_path) {
                        console.warn('No PDF path found for invoice:', initialInvoice.id);
                        return;
                    }
                    
                    // Generate signed URL
                    const { data: urlData, error: urlError } = await supabase.storage
                        .from('purchase_invoices')
                        .createSignedUrl(invoiceData.pdf_path, 3600);
                    
                    if (urlError || !urlData?.signedUrl) {
                        console.error('Error generating signed URL:', urlError);
                        return;
                    }
                    
                    // Fetch PDF from signed URL
                    const res = await fetch(urlData.signedUrl);
                    if (!res.ok) {
                        throw new Error(`Failed to fetch PDF: ${res.status} ${res.statusText}`);
                    }
                    
                    const blob = await res.blob();
                    const mimeType = blob.type || 'application/pdf';
                    const file = new File([blob], "invoice.pdf", { type: mimeType });
                    setFileBlob(file);
                } catch (error) {
                    console.error('Error loading PDF from path:', error);
                    toast({
                        variant: 'destructive',
                        title: 'PDF kan niet worden geladen',
                        description: 'Het PDF bestand kon niet worden ingelezen. Controleer of het bestand bestaat en toegankelijk is.',
                    });
                    setFileBlob(null);
                }
            };
            
            loadPdfFromPath();
        } else {
            setFileBlob(null);
        }

    }, [initialInvoice, isOpen, suppliersKvkMap, suppliersNameMap]);


    const handleCreateSupplier = async () => {
        if (!fileBlob) return;
        setIsCreatingSupplier(true);
        const success = await onCreateSupplier(fileBlob, invoice.id);
        if (success) {
            setSupplierExists(true);
            // Refresh the invoice data by updating it from parent
            // The parent will refresh via fetchInvoices
        }
        setIsCreatingSupplier(false);
    };

    const handleCategoryChange = async (newCategory: PurchaseInvoiceCategory) => {
        if (!invoice || newCategory === invoice.category) return;

        setSelectedCategory(newCategory);
        try {
            const { error } = await supabase.from('purchase_invoices').update({ category: newCategory }).eq('id', invoice.id);
            if (error) throw error;
            toast({ title: 'Categorie bijgewerkt', description: `De categorie is gewijzigd naar "${purchaseInvoiceCategoryTranslations[newCategory]}".` });
        } catch (error) {
            console.error('Error updating category:', error);
            toast({ variant: 'destructive', title: 'Fout', description: 'Kon de categorie niet bijwerken.' });
             setSelectedCategory(invoice.category || ''); // revert on failure
        }
    };
    
    const handleBookInvoice = async () => {
        if (!invoice) return;
        if (!selectedCategory) {
            toast({
                variant: 'destructive',
                title: 'Categorie verplicht',
                description: 'Selecteer een categorie voordat u de factuur inboekt.',
            });
            return;
        }

        setIsProcessing(true);
        try {
            // Mark as processed
            const { error } = await supabase
              .from('purchase_invoices')
              .update({ status: 'Verwerkt', category: selectedCategory })
              .eq('id', invoice.id);
            if (error) throw error;

            toast({
                title: 'Factuur Verwerkt',
                description: `De factuur is succesvol ingeboekt en heeft de status "${newStatus}" gekregen.`,
            });
            onClose();
        } catch (error) {
            console.error("Error booking invoice:", error);
            toast({
                variant: 'destructive',
                title: 'Inboeken mislukt',
                description: 'Er is een fout opgetreden bij het bijwerken van de factuurstatus.',
            });
        } finally {
            setIsProcessing(false);
        }
    };

    if (!invoice) return null;
    
    // Use database fields first, fallback to OCR result if available
    const ocrData = invoice.ocrResult || invoice.aiResult; // Backwards compatibility
    const invoiceDateStr = invoice.invoiceDate || ocrData?.invoiceDate;
    const dueDateStr = invoice.dueDate || ocrData?.dueDate;
    const invoiceDate = invoiceDateStr ? (invoiceDateStr.includes('T') ? format(parseISO(invoiceDateStr), 'dd-MM-yyyy') : format(new Date(invoiceDateStr), 'dd-MM-yyyy')) : 'N/A';
    const dueDate = dueDateStr ? (dueDateStr.includes('T') ? format(parseISO(dueDateStr), 'dd-MM-yyyy') : format(new Date(dueDateStr), 'dd-MM-yyyy')) : 'N/A';
    
    // Match license plate from OCR with vehicles in fleet
    const suggestedLicensePlate = useMemo(() => {
        if (!ocrData?.licensePlate) return null;
        const ocrPlate = ocrData.licensePlate.replace(/[-\s]/g, '').toUpperCase();
        return vehicles.find(v => 
            v.licensePlate.replace(/[-\s]/g, '').toUpperCase() === ocrPlate
        )?.licensePlate || null;
    }, [ocrData?.licensePlate, vehicles]);
    
    const canBook = supplierExists && invoice.status === 'Nieuw' && !isProcessing && !!selectedCategory;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Factuurdetails</DialogTitle>
                    <DialogDescription>
                        {ocrData ? 
                            'Controleer de automatisch ingelezen gegevens, kies een categorie en boek de factuur in.' :
                            'Voer de factuurgegevens in, kies een categorie en boek de factuur in.'
                        }
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
                    <div className="space-y-4 overflow-y-auto pr-2">
                        <div className="p-4 border rounded-lg space-y-3">
                             <InfoRow label="Leverancier" value={invoice.supplierName || ocrData?.supplierName}>
                                {supplierExists ? (
                                     <Badge variant="success"><CheckCircle className="mr-2 h-4 w-4" /> Herkend</Badge>
                                ) : (
                                    <Button size="sm" variant="outline" onClick={handleCreateSupplier} disabled={isCreatingSupplier}>
                                        {isCreatingSupplier ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4" />}
                                        Aanmaken
                                    </Button>
                                )}
                             </InfoRow>
                             <InfoRow label="Factuurnummer" value={invoice.kenmerk || ocrData?.invoiceNumber} />
                             <InfoRow label="Factuurdatum" value={invoiceDate} />
                             <InfoRow label="Vervaldatum" value={dueDate} />
                             <div className="flex justify-between items-center text-sm">
                                <p className="text-muted-foreground">Kenteken</p>
                                <Select
                                    value={invoice.licensePlate || suggestedLicensePlate || '__none__'}
                                    onValueChange={(newPlate) => {
                                        if (onInvoicePlateChange) {
                                            onInvoicePlateChange(invoice.id, newPlate);
                                        } else {
                                            // Fallback: use line plate change function
                                            onPlateChange(invoice.id, 0, newPlate);
                                        }
                                    }}
                                >
                                    <SelectTrigger className="w-[250px]">
                                        <div className="flex items-center gap-1.5">
                                            <Truck className="h-4 w-4"/>
                                            <SelectValue placeholder="Kies een kenteken..." />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">Geen</SelectItem>
                                        {suggestedLicensePlate && (
                                            <SelectItem value={suggestedLicensePlate} className="font-semibold bg-muted">
                                                {suggestedLicensePlate} (Voorgesteld)
                                            </SelectItem>
                                        )}
                                        {vehicles.map(v => (
                                            <SelectItem key={v.id} value={v.licensePlate}>
                                                {v.licensePlate}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="flex justify-between items-center text-sm">
                                <p className="text-muted-foreground">Categorie</p>
                                <Select onValueChange={(value) => handleCategoryChange(value as PurchaseInvoiceCategory)} value={selectedCategory}>
                                    <SelectTrigger className="w-[250px]">
                                        <SelectValue placeholder="Kies een categorie..." />
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
                        
                        {ocrData?.description && (
                            <div className="p-4 border rounded-lg">
                                <p className="text-sm font-semibold mb-2">Omschrijving</p>
                                <p className="text-sm text-muted-foreground">{ocrData.description}</p>
                            </div>
                        )}
                        
                        <Separator />

                        <div className="space-y-2">
                            <InfoRow label="Subtotaal" value={formatCurrency(ocrData?.subTotal)} />
                            <InfoRow label="BTW" value={formatCurrency(ocrData?.vatTotal)} />
                            <div className="flex justify-between text-base font-bold pt-2">
                                <p>Totaalbedrag</p>
                                <p>{formatCurrency(invoice.grandTotal)}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-muted rounded-lg flex items-center justify-center overflow-auto p-4">
                        {fileBlob ? (
                            <PdfPreview file={fileBlob} />
                        ) : (
                            <Skeleton className="h-full w-full" />
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="ghost">Sluiten</Button>
                    </DialogClose>
                    {invoice.status === 'Nieuw' && (
                         <Button onClick={handleBookInvoice} disabled={!canBook}>
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Factuur Inboeken
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
