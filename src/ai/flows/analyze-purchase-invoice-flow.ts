'use server';
/**
 * @fileOverview An AI flow to analyze a purchase invoice and extract all relevant booking details.
 *
 * - analyzePurchaseInvoice - A function that handles the full invoice analysis process.
 * - AnalyzePurchaseInvoiceInput - The input type for the analyzePurchaseInvoice function.
 * - AnalyzePurchaseInvoiceOutput - The return type for the analyzePurchaseInvoice function.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

const AnalyzePurchaseInvoiceInputSchema = z.object({
  invoiceDataUri: z
    .string()
    .describe(
      "A photo or PDF of a supplier invoice, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'"
    ),
});

export type AnalyzePurchaseInvoiceInput = z.infer<typeof AnalyzePurchaseInvoiceInputSchema>;

const InvoiceLineSchema = z.object({
    description: z.string().describe("The full description of the line item. Do NOT include the license plate in this field."),
    quantity: z.number().default(1).describe("The quantity of the item. Default to 1 if not specified."),
    unitPrice: z.number().describe("The price per unit, excluding VAT."),
    total: z.number().describe("The total price for the line, excluding VAT."),
    vatRate: z.number().default(21).describe("The VAT rate for the line item as a percentage (e.g., 21 for 21%). Default to 21 if not specified."),
    licensePlate: z.string().optional().describe("The license plate associated with this specific line item. If found, extract it here."),
});

const AnalyzePurchaseInvoiceOutputSchema = z.object({
    supplierName: z.string().min(1).describe("The full, official name of the supplier company found in the TOP/HEADER section of the invoice, exactly as it appears. This is the company that SENT the invoice (not the recipient). Examples: 'aPear' (preserve exact capitalization), 'ABN AMRO Asset Based Finance N.V.', 'Stuurlui'. This field is MANDATORY and must never be empty. Look for the company name near the logo or in the header section. Preserve the exact spelling and capitalization as shown on the invoice. Do NOT use 'R&M Janssen Transport' or any variant of it."),
    invoiceNumber: z.string().optional().describe("The invoice number or reference."),
    invoiceDate: z.string().optional().describe("The date the invoice was issued. You must recognize various formats like DD-MM-YYYY, DD/MM/YYYY, etc., and always convert it to YYYY-MM-DD format."),
    dueDate: z.string().optional().describe("The payment due date. If an explicit due date is present (e.g., 'vervaldatum', 'te betalen voor'), use that. Otherwise, you MUST calculate it from the invoice date and payment terms (e.g., 'Betaling binnen 14 dagen'). Always return in YYYY-MM-DD format. This field can be omitted if isDirectDebit is true."),
    subTotal: z.number().optional().describe("The total amount excluding VAT."),
    vatTotal: z.number().optional().describe("The total VAT amount."),
    grandTotal: z.number().describe("The final total amount including VAT. This is the most important financial figure. You must find the correct total amount, which is often labeled 'Totaal te betalen' or 'Totaal incl. BTW'. Be very careful not to confuse this with other amounts like subtotals, VAT, or other numbers on the document."),
    lines: z.array(InvoiceLineSchema).optional().describe("An array of all line items on the invoice. If no lines are found, this can be empty."),
    isDirectDebit: z.boolean().optional().describe("Set to true if the invoice mentions it will be paid by direct debit ('automatisch afgeschreven', 'automatische incasso')."),
    // Supplier company details
    kvkNumber: z.string().optional().describe("The KVK (Chamber of Commerce) number of the supplier. Look for 'KvK' or 'KVK' in the supplier's section of the invoice."),
    vatNumber: z.string().optional().describe("The VAT (BTW) number of the supplier. Look for 'BTW', 'Btw-nummer', 'VAT', or 'Tax ID' in the supplier's section."),
    iban: z.string().optional().describe("The IBAN of the supplier for payment. Look for 'IBAN' in the payment section. If multiple IBANs are found, extract only the first valid one."),
    supplierAddress: z.object({
        street: z.string().optional().describe("The street name of the supplier, without the house number."),
        houseNumber: z.string().optional().describe("The house number of the supplier, including any additions like '4a'."),
        postalCode: z.string().optional().describe("The postal code of the supplier, e.g., '1234 AB' or '5571 SK'."),
        city: z.string().optional().describe("The city name of the supplier."),
    }).optional().describe("The full address of the supplier. Parse Dutch address patterns carefully: street name, then house number, then postal code, then city. Example: 'Eeltscheweg 1, 52328X, s-Hertogenbosch' should be parsed as street: 'Eeltscheweg', houseNumber: '1', postalCode: '52328X', city: 's-Hertogenbosch'."),
});

export type AnalyzePurchaseInvoiceOutput = z.infer<typeof AnalyzePurchaseInvoiceOutputSchema>;

const analyzePurchaseInvoicePrompt = ai.definePrompt({
  name: 'analyzePurchaseInvoicePrompt',
  input: { schema: AnalyzePurchaseInvoiceInputSchema },
  output: { schema: AnalyzePurchaseInvoiceOutputSchema },
  prompt: `Analyze the invoice and extract accounting details.

**CRITICAL RULE: The supplier is the company that SENT the invoice. Your own company, "R&M Janssen Transport", is the recipient. You MUST find the supplier's name on the document and IGNORE "R&M Janssen Transport" when determining the supplierName.**

**SUPPLIER NAME EXTRACTION - CRITICAL:**
- The supplier name is ALWAYS located in the TOP section of the invoice, typically:
  - Near the logo (usually top-left or top-center)
  - In the header section before invoice details
  - Often appears as "From:", "From", or with company logo
  - The company name that appears with the sender's address/contact information
- The supplier name is NEVER in the "Billed To", "Customer", "Klant", or recipient sections
- Look for company names that are NOT "R&M Janssen Transport", "RM Janssen Transport", or similar variations
- Common patterns: company logo + company name, or company name appearing first in the document
- If you see a company name near a logo at the top, that is likely the supplier
- **MANDATORY**: You MUST extract a supplier name. If you cannot find one, look more carefully at the top of the document. Do NOT return an empty string or "-".

Fields:
- isDirectDebit: **CRITICAL**: Scan the document for terms like "automatisch afgeschreven" or "automatische incasso". If found, you MUST set this to true.
- supplierName: The sender's FULL company name exactly as it appears on the invoice. This is NOT "R&M Janssen Transport". Find the correct external company name in the TOP/HEADER section of the invoice. Example: "ABN AMRO Asset Based Finance N.V.", not just "ABN AMRO". For "aPear" (with lowercase 'a'), extract exactly as "aPear" - preserve the exact capitalization and spelling. **Crucially, ensure consistent capitalization for other names; 'STUURLUI' and 'stuurlui' should both be normalized to 'Stuurlui'. Always extract the full official company name exactly as shown, including any prefixes like "a" in lowercase.**
- kvkNumber: Extract the KVK (Chamber of Commerce) number from the supplier's section. Look for "KvK", "KVK", or "Kamer van Koophandel" followed by numbers.
- vatNumber: Extract the VAT/BTW number from the supplier's section. Look for "BTW", "Btw-nummer", "VAT", "Tax ID", or "AT Reg #" followed by an alphanumeric code.
- iban: Extract the IBAN from the payment section. Look for "IBAN" followed by a bank account number. If multiple IBANs are found, extract only the first valid one. Format should be like "NL91ABNA0417164300".
- supplierAddress: Extract the supplier's full address from the header section. Parse it carefully:
  - street: The street name without house number (e.g., "Eeltscheweg")
  - houseNumber: The house number including additions (e.g., "1" or "4a")
  - postalCode: The postal code in Dutch format (e.g., "52328X" or "5571 SK")
  - city: The city name (e.g., "'s-Hertogenbosch" or "Bergeijk")
  - Parse Dutch address patterns: street name, then house number, then postal code, then city.
  - Example: "Eeltscheweg 1, 's-Hertogenbosch, Noord-Brabant 52328X, Netherlands" should be parsed as street: "Eeltscheweg", houseNumber: "1", postalCode: "52328X", city: "'s-Hertogenbosch"
- invoiceNumber: Unique invoice identifier.
- invoiceDate: Issue date (YYYY-MM-DD).
- dueDate: CRITICAL: Find explicit due date ('vervaldatum', 'te betalen voor'). If none, calculate from payment terms ('Betaling binnen ... dagen') and invoiceDate. Format: YYYY-MM-DD. **If isDirectDebit is true, you can leave this field empty.**
- subTotal: Total before VAT.
- vatTotal: Total VAT amount.
- grandTotal: **CRITICAL**: The final amount to pay. You must find the correct total amount, which is often labeled 'Totaal te betalen' or 'Totaal incl. BTW'. Be very careful not to confuse this with the subtotal, VAT amount, or other numbers on the document. This is the most important field.

**Line Item Extraction Rules:**
- The invoice is structured in blocks. Each block consists of one or more product/service lines followed by a summary line "Afgenomen door: [license_plate]".
- You MUST process the document block by block.
- For each block, first extract all the product/service lines (e.g., 'Diesel NRG', 'AdBlue').
- Then, find the "Afgenomen door:" line that concludes the block.
- You MUST apply the license plate from that "Afgenomen door:" line to ALL the product/service lines you just extracted for that block.
- **CRITICAL**: The "Afgenomen door:" line itself is NOT a billable item. DO NOT create a line item for it in the output. Its sole purpose is to provide the license plate for the preceding lines in its block.

- For each line item:
    - description: Full text, but EXCLUDE license plate/mileage. For "Onderhoud 98-BPX-9 585546 KM", use "Onderhoud".
    - quantity: Quantity ('Aantal').
    - unitPrice: Price per unit ('Prijs').
    - total: Line total, excluding VAT.
    - vatRate: VAT percentage (default 21).
    - licensePlate: Apply the license plate from the block's "Afgenomen door:" line here. If no plate is found for a line, leave the field empty.

Be precise. If missing, omit field, but always find dueDate unless it's a direct debit.

Document: {{media url=invoiceDataUri}}`,
});

const analyzePurchaseInvoiceFlow = ai.defineFlow(
  {
    name: 'analyzePurchaseInvoiceFlow',
    inputSchema: AnalyzePurchaseInvoiceInputSchema,
    outputSchema: AnalyzePurchaseInvoiceOutputSchema,
  },
  async (input) => {
    const { output } = await analyzePurchaseInvoicePrompt(input);
    if (!output) {
      throw new Error('Could not analyze the invoice. The model did not return an output.');
    }
    return output;
  }
);

export async function analyzePurchaseInvoice(input: AnalyzePurchaseInvoiceInput): Promise<AnalyzePurchaseInvoiceOutput> {
  return analyzePurchaseInvoiceFlow(input);
}
