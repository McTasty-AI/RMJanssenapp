
'use server';

/**
 * @fileOverview An AI flow to analyze a document (email body, Excel/CSV content)
 * and extract a weekly rate, which can be a DOT percentage or a fixed mileage rate.
 *
 * - analyzeRateDocument - A function that handles the rate analysis process.
 * - AnalyzeRateDocumentInput - The input type for the analyzeRateDocument function.
 * - AnalyzeRateDocumentOutput - The return type for the analyzeRateDocument function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const AnalyzeRateDocumentInputSchema = z.object({
  documentContent: z.string().describe('The content of the document to analyze. This can be text from an email, a CSV string from an Excel file, etc.'),
  rateType: z.enum(['dot', 'variable']).describe('The type of rate to look for. "dot" means a percentage, "variable" means a currency amount for mileage.'),
});
export type AnalyzeRateDocumentInput = z.infer<typeof AnalyzeRateDocumentInputSchema>;


const AnalyzeRateDocumentOutputSchema = z.object({
  rate: z.number().optional().describe('The extracted rate. This should be a percentage for DOT or a decimal number for a variable rate. If no rate is found, this field can be empty.'),
});
export type AnalyzeRateDocumentOutput = z.infer<typeof AnalyzeRateDocumentOutputSchema>;


const analyzeRateDocumentPrompt = ai.definePrompt({
  name: 'analyzeRateDocumentPrompt',
  input: { schema: AnalyzeRateDocumentInputSchema },
  output: { schema: AnalyzeRateDocumentOutputSchema },
  prompt: `You are a financial data extraction expert for a transport company. 
  Your task is to analyze the following document content (which could be from an Excel/CSV file or an email) and extract a single, specific financial rate.
  The type of rate you need to find is specified by the 'rateType' parameter.

  - If 'rateType' is "dot", you must find the **DOT (Diesel Oil Surcharge) percentage**. This is usually written as a percentage (e.g., 12,5%, 12.5%, 12.50 pct). Look for terms like "DOT", "diesel", or "brandstoftoeslag". Extract only the number (e.g., 12.5).

  - If 'rateType' is "variable", you must find the **variable mileage rate (kilometertarief)**. This is a currency amount, often per kilometer (e.g., € 1,23, 1.23, 1,23 EUR). Look for terms like "kilometertarief", "km tarief", or "rate per km". Extract only the number (e.g., 1.23).

  Critically evaluate all numbers in the document. **Ignore numbers that are clearly week numbers, dates, years, or anything other than the requested rate.** Find the single most plausible rate based on the context. If no clear rate is found, leave the 'rate' field empty.

  Rate Type to Find: {{{rateType}}}

  Document Content:
  ---
  {{{documentContent}}}
  ---
  `,
});

const analyzeRateDocumentFlow = ai.defineFlow(
  {
    name: 'analyzeRateDocumentFlow',
    inputSchema: AnalyzeRateDocumentInputSchema,
    outputSchema: AnalyzeRateDocumentOutputSchema,
  },
  async (input) => {
    const { output } = await analyzeRateDocumentPrompt(input);
    if (!output) {
      throw new Error('Could not analyze the document. The model did not return an output.');
    }
    return output;
  }
);


export async function analyzeRateDocument(input: AnalyzeRateDocumentInput): Promise<AnalyzeRateDocumentOutput> {
  return analyzeRateDocumentFlow(input);
}
