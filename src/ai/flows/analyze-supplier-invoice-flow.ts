'use server';
/**
 * @fileOverview An AI flow to analyze a supplier invoice and extract relevant details.
 *
 * - analyzeSupplierInvoice - A function that handles the invoice analysis process.
 * - AnalyzeSupplierInvoiceInput - The input type for the analyzeSupplierInvoice function.
 * - AnalyzeSupplierInvoiceOutput - The return type for the analyzeSupplierInvoice function.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

const AnalyzeSupplierInvoiceInputSchema = z.object({
  invoiceDataUri: z
    .string()
    .describe(
      "A photo or PDF of a supplier invoice, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'"
    ),
});

export type AnalyzeSupplierInvoiceInput = z.infer<typeof AnalyzeSupplierInvoiceInputSchema>;

const AnalyzeSupplierInvoiceOutputSchema = z.object({
  companyName: z.string().describe('The name of the supplier company.'),
  kvkNumber: z.string().optional().describe('The KVK (Chamber of Commerce) number of the supplier.'),
  vatNumber: z.string().optional().describe('The VAT (BTW) number of the supplier.'),
  iban: z.string().optional().describe('The IBAN of the supplier. If multiple IBANs are listed, pick the first one.'),
  address: z.object({
    street: z.string().optional().describe('The street name, without the house number.'),
    houseNumber: z.string().optional().describe('The house number, including any additions.'),
    postalCode: z.string().optional().describe('The postal code, e.g., 1234 AB.'),
    city: z.string().optional().describe('The city name.'),
  }).optional().describe('The address of the supplier.'),
});

export type AnalyzeSupplierInvoiceOutput = z.infer<typeof AnalyzeSupplierInvoiceOutputSchema>;

const analyzeInvoicePrompt = ai.definePrompt({
  name: 'analyzeSupplierInvoicePrompt',
  input: { schema: AnalyzeSupplierInvoiceInputSchema },
  output: { schema: AnalyzeSupplierInvoiceOutputSchema },
  prompt: `You are an expert document analysis AI for Dutch invoices. Analyze the invoice and extract the details for the SUPPLIER (the company that sent the invoice).
  You MUST IGNORE the customer data (which is likely "R&M Janssen Transport").
  Extract these fields from the supplier's details:
  - Company Name
  - KVK number: Look for "KvK" or "KVK".
  - VAT number: Look for "BTW" or "Btw-nummer".
  - IBAN: Look for "IBAN", "ABN-AMRO", or "Rabobank". If multiple IBANs are found, extract only the first valid one.
  - Address: This is a complex field. You must identify the full address line of the supplier and then **very carefully split it into separate components**.
    The supplier address is typically in the header or footer.
    Follow these steps PRECISELY for the address:
    1. First, locate the single line containing the street, house number, postal code, and city.
    2. From that line, parse the individual components based on Dutch address patterns (street name, then house number, then postal code, then city).
    3. Example: An address line like "Elskensakker 4a - 5571 SK Bergeijk" should be parsed as:
        - street: "Elskensakker"
        - houseNumber: "4a"
        - postalCode: "5571 SK"
        - city: "Bergeijk"
    
    **DO NOT** combine fields. **DO NOT** include extra text like "Telefoon:", phone numbers, or email addresses in any of the address components. Your parsing for the address MUST stop after the city name.
    Prefer accuracy over completeness—if unsure about a specific component, leave that optional field empty.
    
  Return only the data for the supplier who sent the document.

Document: {{media url=invoiceDataUri}}`,
});

const analyzeSupplierInvoiceFlow = ai.defineFlow(
  {
    name: 'analyzeSupplierInvoiceFlow',
    inputSchema: AnalyzeSupplierInvoiceInputSchema,
    outputSchema: AnalyzeSupplierInvoiceOutputSchema,
  },
  async (input) => {
    const { output } = await analyzeInvoicePrompt(input);
    if (!output) {
      throw new Error('Could not analyze the invoice. The model did not return an output.');
    }
    return output;
  }
);

export async function analyzeSupplierInvoice(input: AnalyzeSupplierInvoiceInput): Promise<AnalyzeSupplierInvoiceOutput> {
  return analyzeSupplierInvoiceFlow(input);
}
