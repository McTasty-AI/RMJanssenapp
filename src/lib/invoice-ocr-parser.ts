'use client';

/**
 * OCR-based invoice parser - kostenloos alternatief voor AI analyse
 * Gebruikt pdfjs-dist voor PDFs en Tesseract.js voor afbeeldingen
 */

import type { AnalyzePurchaseInvoiceOutput } from '@/ai/flows/analyze-purchase-invoice-flow';

/**
 * Extract text from PDF using pdfjs-dist
 * Dynamically imported to avoid bundling issues with Turbopack
 */
async function extractTextFromPDF(file: File): Promise<string> {
    // Dynamically import pdfjs-dist to avoid SSR and bundling issues
    const pdfjs = await import('pdfjs-dist');
    
    // Set up pdf.js worker (only in browser)
    // Use CDN worker URL - Next.js/Webpack doesn't support new URL() with import.meta.url for ESM packages
    if (typeof window !== 'undefined') {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || '4.4.168'}/pdf.worker.min.mjs`;
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const typedArray = new Uint8Array(arrayBuffer);
    const pdf = await pdfjs.getDocument(typedArray).promise;
    
    let textContent = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const text = await page.getTextContent();
        textContent += text.items.map((s: any) => s.str).join(' ') + '\n';
    }
    
    return textContent;
}

/**
 * Extract text from image using Tesseract.js OCR
 * Only works in browser environment
 */
async function extractTextFromImage(file: File): Promise<string> {
    // Check if we're in browser environment
    if (typeof window === 'undefined') {
        throw new Error('OCR is only available in browser environment');
    }
    
    try {
        // Dynamically import Tesseract.js to avoid SSR issues
        // Wait a tick to ensure we're fully client-side
        await new Promise(resolve => setTimeout(resolve, 0));
        
        let Tesseract;
        try {
            // Use dynamic import - Turbopack should handle this correctly
            const tesseractModule = await import('tesseract.js');
            // Handle both default and named exports
            Tesseract = tesseractModule.default || tesseractModule;
            
            // Verify Tesseract is actually available
            if (!Tesseract || typeof Tesseract.recognize !== 'function') {
                throw new Error('Tesseract.js module loaded but recognize function not available');
            }
        } catch (importError: any) {
            console.error('Tesseract import error:', importError);
            
            // Check if the error is due to HTML response (common Turbopack issue)
            const errorMessage = importError?.message || importError?.toString() || '';
            if (errorMessage.includes('Unexpected token') || 
                errorMessage.includes('<') ||
                errorMessage.includes('SyntaxError')) {
                throw new Error(
                    'Tesseract.js module could not be loaded due to a bundler configuration issue. ' +
                    'Please restart your development server and ensure tesseract.js is properly installed.'
                );
            }
            
            // Fallback: try loading from window if available
            if ((window as any).Tesseract) {
                Tesseract = (window as any).Tesseract;
            } else {
                throw new Error(
                    `Tesseract.js is not available. Import error: ${importError instanceof Error ? importError.message : 'Unknown error'}. ` +
                    'Please ensure it is installed: npm install tesseract.js'
                );
            }
        }
        
        const { data: { text } } = await Tesseract.recognize(file, 'nld+eng', {
            logger: (m) => {
                // Optioneel: log progress
                if (m.status === 'recognizing text') {
                    console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                }
            },
        });
        
        return text;
    } catch (error) {
        console.error('OCR Error:', error);
        throw new Error(`Failed to extract text from image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Extract text from file (PDF or image)
 */
async function extractTextFromFile(file: File): Promise<string> {
    if (file.type === 'application/pdf') {
        return await extractTextFromPDF(file);
    } else if (file.type.startsWith('image/')) {
        return await extractTextFromImage(file);
    } else {
        throw new Error('Unsupported file type. Only PDF and images are supported.');
    }
}

/**
 * Parse date from various formats (DD-MM-YYYY, DD/MM/YYYY, etc.)
 */
function parseDate(dateStr: string | null | undefined): string | undefined {
    if (!dateStr) return undefined;
    
    // Remove common prefixes
    const cleaned = dateStr.replace(/^(factuurdatum|datum|vervaldatum|te betalen voor):?\s*/i, '').trim();
    
    // Try DD-MM-YYYY or DD/MM/YYYY
    const formats = [
        /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/,
        /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
    ];
    
    for (const regex of formats) {
        const match = cleaned.match(regex);
        if (match) {
            let day: string, month: string, year: string;
            if (match[3] && match[3].length === 4) {
                // DD-MM-YYYY
                day = match[1].padStart(2, '0');
                month = match[2].padStart(2, '0');
                year = match[3];
            } else {
                // YYYY-MM-DD
                year = match[1];
                month = match[2].padStart(2, '0');
                day = match[3].padStart(2, '0');
            }
            return `${year}-${month}-${day}`;
        }
    }
    
    return undefined;
}

/**
 * Extract monetary amounts from text
 */
function extractAmount(text: string, patterns: RegExp[]): number | undefined {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            // Try both match[1] and match[2] in case pattern has multiple groups
            const amountStr = (match[1] || match[2] || match[0])
                .replace(/[€\s]/g, '')
                .replace(/\./g, '') // Remove thousand separators
                .replace(',', '.'); // Replace comma with dot for decimal
            const amount = parseFloat(amountStr);
            if (!isNaN(amount) && amount > 0) {
                return amount;
            }
        }
    }
    return undefined;
}

/**
 * Extract supplier name (exclude own company name)
 * Look for company name that is NOT "R&M Janssen Transport"
 */
function extractSupplierName(text: string): string | undefined {
    const ownCompanyPatterns = [
        /R[&.]?\s*M\s*Janssen/i,
        /RM\s*Janssen/i,
        /Janssen\s*Transport/i,
        /R\s*&\s*M\s*Janssen\s*Transport/i,
    ];
    
    // Split text into lines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    
    // Look for company names (usually in header area, first 30 lines)
    for (let i = 0; i < Math.min(30, lines.length); i++) {
        const line = lines[i];
        
        // Skip if it's our own company
        if (ownCompanyPatterns.some(pattern => pattern.test(line))) {
            continue;
        }
        
        // Skip addresses, phone numbers, emails
        if (/@|tel|telefoon|t\s*[0-9]|€|€\s*\d/i.test(line)) {
            continue;
        }
        
        // Company names usually:
        // - Are capitalized or have B.V., N.V., etc.
        // - Are longer than 5 characters
        // - Don't contain common invoice words
        // - Don't start with numbers
        if (
            line.length > 5 &&
            line.length < 100 &&
            !/^(factuur|invoice|datum|totaal|btw|vat|klant|customer|naar|aan)/i.test(line) &&
            !/^\d+/.test(line) &&
            !/^€/.test(line) &&
            (line.match(/[A-Z]{2,}/) || /B\.V\.|N\.V\.|BV|NV|PROFILE/i.test(line))
        ) {
            // Clean up common suffixes
            return line.replace(/\s+/g, ' ').trim();
        }
    }
    
    return undefined;
}

/**
 * Extract invoice number
 */
function extractInvoiceNumber(text: string): string | undefined {
    const patterns = [
        /factuurnummer[:\s]+([A-Z0-9-]+)/i,
        /invoice\s*(?:number|#)[:\s]+([A-Z0-9-]+)/i,
        /factuur[:\s]+([A-Z0-9-]+)/i,
        /nr[.:\s]+([A-Z0-9-]+)/i,
        /no[.:\s]+([A-Z0-9-]+)/i,
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    
    return undefined;
}

/**
 * Calculate due date from invoice date and payment terms
 */
function calculateDueDate(invoiceDate: string | undefined, text: string): string | undefined {
    if (!invoiceDate) return undefined;
    
    // Look for payment terms
    const paymentTermPatterns = [
        /betaling\s+binnen\s+(\d+)\s+dagen/i,
        /payment\s+within\s+(\d+)\s+days/i,
        /(\d+)\s+dagen/i,
    ];
    
    let days = 30; // Default
    
    for (const pattern of paymentTermPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            days = parseInt(match[1], 10);
            break;
        }
    }
    
    try {
        const date = new Date(invoiceDate);
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
    } catch {
        return undefined;
    }
}

/**
 * Extract line items from invoice text
 */
function extractLineItems(text: string): Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    vatRate: number;
    licensePlate?: string;
}> {
    const lines: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
        vatRate: number;
        licensePlate?: string;
    }> = [];
    
    // First, extract license plate from the document (usually near vehicle info)
    let documentLicensePlate: string | undefined;
    const licensePlatePatterns = [
        /(?:kenteken|kentekenplaat)[:\s]+([A-Z0-9]{1,3}[-]?[A-Z0-9]{1,3}[-]?[A-Z0-9]{1,3})/i,
        /([A-Z]{1,2}[-]?[A-Z0-9]{1,3}[-]?[A-Z0-9]{1,3})/i, // Dutch license plate format
    ];
    
    for (const pattern of licensePlatePatterns) {
        const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
        for (const match of matches) {
            const plate = match[1].replace(/-/g, '').toUpperCase();
            // Validate Dutch license plate format (typically 2-3-1 or 1-3-2)
            if (plate.length >= 4 && plate.length <= 8) {
                documentLicensePlate = match[1].trim();
                break;
            }
        }
        if (documentLicensePlate) break;
    }
    
    // Split text into lines
    const textLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let currentLicensePlate: string | undefined = documentLicensePlate;
    let inTableSection = false;
    
    for (let i = 0; i < textLines.length; i++) {
        const line = textLines[i];
        
        // Detect license plate line (multiple patterns)
        const licensePlateMatch = line.match(/(?:afgenomen\s+door|kenteken|kentekenplaat)[:\s]+([A-Z0-9-]+)/i);
        if (licensePlateMatch && licensePlateMatch[1]) {
            currentLicensePlate = licensePlateMatch[1].trim();
            // Apply to previous lines
            for (let j = lines.length - 1; j >= 0 && j > lines.length - 10; j--) {
                if (!lines[j].licensePlate) {
                    lines[j].licensePlate = currentLicensePlate;
                }
            }
            continue;
        }
        
        // Detect table section (usually contains amounts)
        if (/^(omschrijving|artikel|product|dienst|prijs|aantal|totaal)/i.test(line)) {
            inTableSection = true;
            continue;
        }
        
        // Skip header/footer lines
        if (!inTableSection && i < 10) continue;
        if (/(factuur|totaal|btw|vat|te betalen)/i.test(line) && /€/.test(line)) {
            continue;
        }
        
        // Try to extract line item (has amount, quantity, etc.)
        const amountMatch = line.match(/€\s*([\d.,]+)/);
        if (amountMatch) {
            const amount = parseFloat(amountMatch[1].replace(',', '.'));
            
            // Skip if it's a total line
            if (/(totaal|totaal|subtotaal|btw|vat)/i.test(line)) {
                continue;
            }
            
            // Extract quantity if present
            const qtyMatch = line.match(/(\d+(?:[.,]\d+)?)\s*(?:x|×|st|pcs)/i);
            const quantity = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 1;
            
            // Extract description (everything before the amount)
            const description = line
                .replace(/€\s*[\d.,]+.*$/, '')
                .replace(/^\d+[x×]\s*/, '')
                .replace(/\d+\s*(?:km|km|KM)/i, '')
                .trim();
            
            if (description.length > 2 && amount > 0) {
                // Use document-level license plate if available, otherwise try to find it in the line
                let lineLicensePlate = currentLicensePlate;
                
                // Try to extract license plate from the line itself
                const linePlateMatch = description.match(/([A-Z]{1,2}[-]?[A-Z0-9]{1,3}[-]?[A-Z0-9]{1,3})/i);
                if (linePlateMatch) {
                    lineLicensePlate = linePlateMatch[1].trim();
                }
                
                lines.push({
                    description,
                    quantity,
                    unitPrice: amount / quantity,
                    total: amount,
                    vatRate: 21, // Default VAT
                    licensePlate: lineLicensePlate || currentLicensePlate,
                });
            }
        }
    }
    
    return lines;
}

/**
 * Main OCR-based invoice parser
 */
export async function parseInvoiceWithOCR(file: File): Promise<AnalyzePurchaseInvoiceOutput> {
    // Extract text from file
    const text = await extractTextFromFile(file);
    
    console.log('[OCR] Extracted text length:', text.length);
    
    // Extract supplier name
    const supplierName = extractSupplierName(text);
    
    // Extract invoice number
    const invoiceNumber = extractInvoiceNumber(text);
    
    // Extract dates - look for factuurdatum explicitly
    const invoiceDatePatterns = [
        /(?:factuurdatum|factuur\s+datum|datum)[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i,
        /(?:factuurdatum|factuur\s+datum|datum)[:\s]+([^\n]+)/i,
    ];
    
    let invoiceDate: string | undefined = undefined;
    for (const pattern of invoiceDatePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            invoiceDate = parseDate(match[1]);
            if (invoiceDate) break;
        }
    }
    
    // If not found, try to find any date pattern near "factuur" keyword
    if (!invoiceDate) {
        const factuurLineMatch = text.match(/factuur[^\n]*?(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i);
        if (factuurLineMatch) {
            invoiceDate = parseDate(factuurLineMatch[1]);
        }
    }
    
    // Look for explicit due date patterns
    const dueDatePatterns = [
        /(?:gaarne\s+te\s+betalen\s+voor|vervaldatum|te\s+betalen\s+voor|due\s*date)[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i,
        /(?:vervaldatum|due\s*date)[:\s]+([^\n]+)/i,
    ];
    
    let dueDate: string | undefined = undefined;
    for (const pattern of dueDatePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            dueDate = parseDate(match[1]);
            if (dueDate) break;
        }
    }
    
    // Calculate due date if not found explicitly
    if (!dueDate && invoiceDate) {
        dueDate = calculateDueDate(invoiceDate, text);
    }
    
    // Check for direct debit
    const isDirectDebit = /(automatisch\s+afgeschreven|automatische\s+incasso|direct\s+debit)/i.test(text);
    
    // Extract amounts (look for patterns with various formats)
    const grandTotalPatterns = [
        /totaal\s+te\s+betalen[:\s]*€?\s*([\d.,\s]+)/i,
        /totaal\s+incl[.\s]*btw[:\s]*€?\s*([\d.,\s]+)/i,
        /total\s+incl[.\s]*vat[:\s]*€?\s*([\d.,\s]+)/i,
        /totaal\s+bedrag[:\s]*€?\s*([\d.,\s]+)/i,
        /totaal[:\s]*€?\s*([\d.,\s]+)/i,
        /eindtotaal[:\s]*€?\s*([\d.,\s]+)/i,
    ];
    
    let grandTotal = extractAmount(text, grandTotalPatterns);
    
    // If no match found, look for the largest amount in the text (usually the total)
    if (!grandTotal || grandTotal === 0) {
        const allAmounts = text.match(/€?\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})/g);
        if (allAmounts && allAmounts.length > 0) {
            const parsedAmounts = allAmounts
                .map(a => parseFloat(a.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.')))
                .filter(a => !isNaN(a) && a > 0)
                .sort((a, b) => b - a); // Sort descending
            if (parsedAmounts.length > 0) {
                grandTotal = parsedAmounts[0]; // Largest amount is usually the total
            }
        }
    }
    
    const vatTotalPatterns = [
        /btw[:\s]*€?\s*([\d.,\s]+)/i,
        /vat[:\s]*€?\s*([\d.,\s]+)/i,
        /(\d+(?:[.,]\d+)?)\s*%\s*btw[:\s]*€?\s*([\d.,\s]+)/i,
        /omzetbelasting[:\s]*€?\s*([\d.,\s]+)/i,
    ];
    
    const vatTotal = extractAmount(text, vatTotalPatterns);
    
    // Calculate subtotal if grandTotal and vatTotal are available
    const subTotal = grandTotal && vatTotal ? grandTotal - vatTotal : undefined;
    
    // If grandTotal is 0, set it to undefined
    if (grandTotal === 0) {
        grandTotal = undefined;
    }
    
    // Extract line items
    const lines = extractLineItems(text);
    
    return {
        supplierName: supplierName || 'Onbekende leverancier',
        invoiceNumber,
        invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
        dueDate,
        subTotal,
        vatTotal,
        grandTotal: grandTotal || 0,
        lines: lines.length > 0 ? lines : undefined,
        isDirectDebit,
    };
}

