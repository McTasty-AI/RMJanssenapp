/**
 * OCR-based invoice extraction utility
 * Extracts invoice data from PDF using text extraction and pattern matching
 */

// Dynamic import for pdfjs-dist to handle both client and server side
let pdfjsLib: any = null;
let workerConfigured = false;

async function getPdfjsLib() {
  if (pdfjsLib) return pdfjsLib;
  
  // Only work on client side
  if (typeof window === 'undefined') {
    throw new Error('PDF extraction is only supported on the client side');
  }
  
  if (!workerConfigured) {
    try {
      // Use the same import method as PdfPreview.tsx which works successfully
      // Import pdfjs-dist directly (this works in PdfPreview)
      const pdfjsDist = await import('pdfjs-dist');
      
      // pdfjs-dist exports getDocument directly, not as default
      let pdfjs: any = pdfjsDist;
      
      // Check if it's a default export
      if (pdfjsDist.default && typeof pdfjsDist.default.getDocument === 'function') {
        pdfjs = pdfjsDist.default;
      } else if (typeof pdfjsDist.getDocument !== 'function') {
        // Try to find getDocument in the module
        throw new Error('getDocument method not found in pdfjs-dist module');
      }
      
      // Validate that we have a valid pdfjs object
      if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
        throw new Error('PDF.js library loaded but getDocument method not found');
      }
      
      // Completely disable worker by setting it to an invalid URL that will fail immediately
      // This forces PDF.js to use main thread from the start
      if (pdfjs.GlobalWorkerOptions) {
        // Use a data URL that will fail to load, forcing main thread usage
        pdfjs.GlobalWorkerOptions.workerSrc = 'data:application/javascript,void(0);';
        console.log('PDF.js worker disabled - using main thread');
      }
      
      pdfjsLib = pdfjs;
      workerConfigured = true;
    } catch (error) {
      console.error('Error loading pdfjs-dist:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('Full error details:', { errorMessage, errorStack, error });
      throw new Error(`Failed to load PDF.js library: ${errorMessage}`);
    }
  }
  
  return pdfjsLib;
}

export interface ExtractedInvoiceData {
  description?: string;
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  subTotal?: number;
  vatTotal?: number;
  grandTotal?: number;
  licensePlate?: string;
  kvkNumber?: string;
  vatNumber?: string;
  iban?: string;
}

/**
 * Extract text from PDF file
 * Note: Currently disabled due to Next.js/Webpack compatibility issues with pdfjs-dist
 * PDFs are still uploaded and stored - users can enter details manually
 */
async function extractTextFromPdf(_file: File): Promise<string> {
  // PDF extraction is temporarily disabled due to Next.js/Webpack compatibility issues with pdfjs-dist
  // The PDF will be uploaded and stored, but extraction must be done manually
  // TODO: Implement server-side PDF extraction using a library like pdf-parse or an external OCR service
  throw new Error('PDF extraction is temporarily unavailable due to technical limitations. Please enter invoice details manually. The PDF will be stored for later review.');
}

/**
 * Normalize Dutch date formats to YYYY-MM-DD
 */
function parseDutchDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  
  // Remove common prefixes
  dateStr = dateStr.replace(/^(factuurdatum|datum|vervaldatum|te betalen voor|betaaldatum):?\s*/i, '').trim();
  
  // Try various Dutch date formats
  const patterns = [
    // DD-MM-YYYY
    /(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/,
    // YYYY-MM-DD
    /(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/,
    // DD-MM-YY
    /(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2})/,
  ];
  
  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      let day: string, month: string, year: string;
      
      if (match[1].length === 4) {
        // YYYY-MM-DD format
        year = match[1];
        month = match[2].padStart(2, '0');
        day = match[3].padStart(2, '0');
      } else {
        // DD-MM-YYYY or DD-MM-YY
        day = match[1].padStart(2, '0');
        month = match[2].padStart(2, '0');
        year = match[3];
        if (year.length === 2) {
          // Convert YY to YYYY (assume 20XX)
          year = '20' + year;
        }
      }
      
      // Validate date
      const date = new Date(`${year}-${month}-${day}`);
      if (!isNaN(date.getTime())) {
        return `${year}-${month}-${day}`;
      }
    }
  }
  
  return undefined;
}

/**
 * Extract license plate from text (Dutch format)
 */
function extractLicensePlate(text: string): string | undefined {
  // Dutch license plate patterns: XX-99-99, 99-99-XX, 99-XX-99, etc.
  const patterns = [
    /([A-Z]{1,2}[- ]?\d{1,2}[- ]?[A-Z]{1,2}[- ]?\d{1,2})/i,
    /([A-Z]{2}[- ]?\d{2}[- ]?\d{2})/i,
    /([\d]{2}[- ]?[A-Z]{2}[- ]?[\d]{2})/i,
    /([\d]{2}[- ]?[\d]{2}[- ]?[A-Z]{2})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Normalize format: remove spaces, ensure dashes
      const plate = match[1].replace(/\s/g, '').toUpperCase();
      // Format as XX-XX-XX
      if (plate.length === 6) {
        return `${plate.slice(0, 2)}-${plate.slice(2, 4)}-${plate.slice(4, 6)}`;
      }
      return plate;
    }
  }
  
  return undefined;
}

/**
 * Extract monetary amounts from text
 */
function extractAmount(text: string, label: string): number | undefined {
  // Look for label followed by amount
  const patterns = [
    new RegExp(`${label}:?\\s*€?\\s*([\\d.,]+)`, 'i'),
    new RegExp(`${label}:?\\s*([\\d.,]+)\\s*€`, 'i'),
    new RegExp(`€?\\s*([\\d.,]+)\\s*${label}`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amountStr = match[1].replace(/\./g, '').replace(',', '.');
      const amount = parseFloat(amountStr);
      if (!isNaN(amount)) {
        return amount;
      }
    }
  }
  
  return undefined;
}

/**
 * Extract supplier name from text
 * Tries to find company name that is NOT "R&M Janssen Transport"
 */
function extractSupplierName(text: string): string | undefined {
  // Common patterns for supplier names
  const lines = text.split('\n').slice(0, 20); // Check first 20 lines
  
  // Look for company names (usually at the top)
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip if it's our company
    if (trimmed.match(/r[&.]?\s*m[.\s]?janssen/i)) {
      continue;
    }
    // Look for lines that might be company names (capitalized, reasonable length)
    if (trimmed.length > 3 && trimmed.length < 100 && 
        /^[A-Z][A-Za-z0-9\s&.,-]+$/.test(trimmed)) {
      // Check if it's not just a label
      if (!trimmed.match(/^(factuur|invoice|klant|customer|datum|date|totaal|total|bedrag|amount)/i)) {
        return trimmed;
      }
    }
  }
  
  // Fallback: look for "Van:" or "From:" patterns
  const fromPattern = /(?:van|from|afzender|sender):?\s*([A-Z][A-Za-z0-9\s&.,-]+)/i;
  const fromMatch = text.match(fromPattern);
  if (fromMatch && !fromMatch[1].match(/r[&.]?\s*m[.\s]?janssen/i)) {
    return fromMatch[1].trim();
  }
  
  return undefined;
}

/**
 * Extract invoice number
 */
function extractInvoiceNumber(text: string): string | undefined {
  const patterns = [
    /(?:factuurnummer|invoice\s*number|factuur\s*#|invoice\s*#):?\s*([A-Z0-9\-]+)/i,
    /(?:factuur|invoice):?\s*([A-Z0-9\-]{4,})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * Extract KVK number
 */
function extractKvkNumber(text: string): string | undefined {
  const patterns = [
    /(?:kvk|kamer\s*van\s*koophandel):?\s*(\d{8})/i,
    /kvk[:\s]+(\d{8})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return undefined;
}

/**
 * Extract VAT number
 */
function extractVatNumber(text: string): string | undefined {
  const patterns = [
    /(?:btw|vat|btw.?nummer|vat\s*number):?\s*([A-Z]{2}?\d{9}[A-Z0-9]{2})/i,
    /(?:btw|vat)[:\s]+([A-Z]{2}?\d{9}[A-Z0-9]{2})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }
  
  return undefined;
}

/**
 * Extract IBAN
 */
function extractIban(text: string): string | undefined {
  const pattern = /(?:iban):?\s*([A-Z]{2}\d{2}[A-Z0-9]{4,30})/i;
  const match = text.match(pattern);
  if (match) {
    return match[1].toUpperCase();
  }
  
  return undefined;
}

/**
 * Calculate due date from invoice date and payment terms
 */
function calculateDueDate(invoiceDate: string, text: string): string | undefined {
  // Look for payment terms
  const termPatterns = [
    /(?:betaling|payment)\s*(?:binnen|within|in)\s*(\d+)\s*(?:dagen|days)/i,
    /(?:betaaltermijn|payment\s*term):?\s*(\d+)\s*(?:dagen|days)/i,
  ];
  
  for (const pattern of termPatterns) {
    const match = text.match(pattern);
    if (match) {
      const days = parseInt(match[1], 10);
      if (!isNaN(days) && invoiceDate) {
        const date = new Date(invoiceDate);
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
      }
    }
  }
  
  return undefined;
}

/**
 * Main extraction function
 * Note: Currently returns empty data due to PDF extraction being disabled
 * Users should enter invoice details manually
 */
export async function extractInvoiceData(file: File): Promise<ExtractedInvoiceData> {
  // PDF extraction is temporarily disabled due to Next.js/Webpack compatibility issues
  // Return empty result - user will enter details manually via the invoice dialog
  try {
    await extractTextFromPdf(file);
    // This will never execute due to the error thrown above
    return {};
  } catch (error: unknown) {
    // Re-throw the error to inform the caller that extraction is unavailable
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(errorMessage);
  }
}

