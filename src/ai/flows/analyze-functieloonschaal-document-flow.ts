'use server';

/**
 * @fileOverview An AI flow to analyze a salary scale document
 * and extract all salary scale data into a structured format.
 *
 * - analyzeFunctieloonschaalDocument - A function that handles the document analysis.
 * - AnalyzeFunctieloonschaalDocumentInput - The input type for the analyzeFunctieloonschaalDocument function.
 * - AnalyzeFunctieloonschaalDocumentOutput - The return type for the analyzeFunctieloonschaalDocument function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const AnalyzeFunctieloonschaalDocumentInputSchema = z.object({
  documentContent: z.string().describe('The full text content of the salary scale document.'),
});
export type AnalyzeFunctieloonschaalDocumentInput = z.infer<typeof AnalyzeFunctieloonschaalDocumentInputSchema>;


const ScaleStepSchema = z.object({
    step: z.number().describe('The step number (trede).'),
    week: z.number().describe('The gross salary per week for this step.'),
    month: z.number().describe('The gross salary per month for this step.'),
    hour100: z.number().describe('The 100% hourly rate for this step.'),
    hour130: z.number().describe('The 130% hourly rate for this step.'),
    hour150: z.number().describe('The 150% hourly rate for this step.'),
});

const SalaryScaleSchema = z.object({
    scale: z.string().describe('The salary scale letter (e.g., "A", "B", "C").'),
    steps: z.array(ScaleStepSchema).describe('An array containing all the steps for this salary scale.'),
});

const AnalyzeFunctieloonschaalDocumentOutputSchema = z.object({
  extractedScales: z.array(SalaryScaleSchema).describe('An array of all salary scales found in the document.'),
});
export type AnalyzeFunctieloonschaalDocumentOutput = z.infer<typeof AnalyzeFunctieloonschaalDocumentOutputSchema>;


const analyzeFunctieloonschaalDocumentPrompt = ai.definePrompt({
  name: 'analyzeFunctieloonschaalDocumentPrompt',
  input: { schema: AnalyzeFunctieloonschaalDocumentInputSchema },
  output: { schema: AnalyzeFunctieloonschaalDocumentOutputSchema },
  prompt: `You are an expert HR data extraction AI specialized in Dutch salary scales (functieloonschalen).
  Your task is to carefully analyze the provided document content and extract ALL salary scale tables into a structured JSON format.

  For each salary scale (e.g., Schaal A, Schaal B), you must:
  1. Identify the scale letter.
  2. For each step (trede) within that scale, extract the corresponding values for:
     - "Per week"
     - "Per maand"
     - "100%" (uurloon)
     - "130%" (uurloon)
     - "150%" (uurloon)
  3. Ensure all numbers are parsed correctly as numbers, not strings.

  Return the data as an array of 'extractedScales'. Each object in the array should represent one salary scale and contain its letter and an array of all its steps.

  Document Content:
  ---
  {{{documentContent}}}
  ---
  `,
});

const analyzeFunctieloonschaalDocumentFlow = ai.defineFlow(
  {
    name: 'analyzeFunctieloonschaalDocumentFlow',
    inputSchema: AnalyzeFunctieloonschaalDocumentInputSchema,
    outputSchema: AnalyzeFunctieloonschaalDocumentOutputSchema,
  },
  async (input) => {
    const { output } = await analyzeFunctieloonschaalDocumentPrompt(input);
    if (!output) {
      throw new Error('Could not analyze the document. The model did not return an output.');
    }
    return output;
  }
);


export async function analyzeFunctieloonschaalDocument(input: AnalyzeFunctieloonschaalDocumentInput): Promise<AnalyzeFunctieloonschaalDocumentOutput> {
  return analyzeFunctieloonschaalDocumentFlow(input);
}
