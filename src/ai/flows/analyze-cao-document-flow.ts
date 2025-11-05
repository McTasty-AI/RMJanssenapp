
'use server';

/**
 * @fileOverview An AI flow to analyze a CAO document and answer specific questions.
 *
 * - analyzeCaoDocument - A function that handles the document analysis.
 * - AnalyzeCaoDocumentInput - The input type for the analyzeCaoDocument function.
 * - AnalyzeCaoDocumentOutput - The return type for the analyzeCaoDocument function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const AnalyzeCaoDocumentInputSchema = z.object({
  documentContent: z.string().describe('The full text content of the CAO document.'),
  query: z.string().describe('The specific question the user has about the document.'),
});
export type AnalyzeCaoDocumentInput = z.infer<typeof AnalyzeCaoDocumentInputSchema>;


const AnalyzeCaoDocumentOutputSchema = z.object({
  answer: z.string().describe('A clear and concise answer to the user\'s query, based *only* on the provided document content.'),
});
export type AnalyzeCaoDocumentOutput = z.infer<typeof AnalyzeCaoDocumentOutputSchema>;


const analyzeCaoDocumentPrompt = ai.definePrompt({
  name: 'analyzeCaoDocumentPrompt',
  input: { schema: AnalyzeCaoDocumentInputSchema },
  output: { schema: AnalyzeCaoDocumentOutputSchema },
  prompt: `You are an expert HR assistant specialized in Dutch Collective Labor Agreements (CAO's).
  Your task is to carefully analyze the provided CAO document content and answer the user's specific question.

  Base your answer STRICTLY on the information found within the document. Do not use any external knowledge.
  If the answer cannot be found in the document, state that clearly.

  User's Question:
  "{{{query}}}"

  Document Content:
  ---
  {{{documentContent}}}
  ---
  `,
});

const analyzeCaoDocumentFlow = ai.defineFlow(
  {
    name: 'analyzeCaoDocumentFlow',
    inputSchema: AnalyzeCaoDocumentInputSchema,
    outputSchema: AnalyzeCaoDocumentOutputSchema,
  },
  async (input) => {
    const { output } = await analyzeCaoDocumentPrompt(input);
    if (!output) {
      throw new Error('Could not analyze the document. The model did not return an output.');
    }
    return output;
  }
);

export async function analyzeCaoDocument(input: AnalyzeCaoDocumentInput): Promise<AnalyzeCaoDocumentOutput> {
  return analyzeCaoDocumentFlow(input);
}
