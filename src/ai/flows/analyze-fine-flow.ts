
'use server';

/**
 * @fileOverview An AI flow to analyze an image of a fine and extract relevant details.
 *
 * - analyzeFine - A function that handles the fine analysis process.
 * - AnalyzeFineInput - The input type for the analyzeFine function.
 * - AnalyzeFineOutput - The return type for the analyzeFine function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';


const AnalyzeFineInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a traffic fine or ticket, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type AnalyzeFineInput = z.infer<typeof AnalyzeFineInputSchema>;

const AnalyzeFineOutputSchema = z.object({
  amount: z.number().describe('The total amount of the fine in euros. Extract only the number.'),
  reason: z.string().describe('The reason or description of the violation in Dutch. Be specific, e.g., "Overschrijding maximumsnelheid (feitcode VM055)".'),
  date: z.string().describe('The date of the violation in YYYY-MM-DD format.'),
  time: z.string().optional().describe('The time of the violation in HH:mm format. If no time is found, leave this field empty.'),
  licensePlate: z.string().optional().describe('The license plate on the fine. If no valid license plate is found, leave this field empty.'),
});
export type AnalyzeFineOutput = z.infer<typeof AnalyzeFineOutputSchema>;

const analyzeFinePrompt = ai.definePrompt({
  name: 'analyzeFinePrompt',
  input: { schema: AnalyzeFineInputSchema },
  output: { schema: AnalyzeFineOutputSchema },
  prompt: `You are an expert document analysis AI, specializing in Dutch traffic fines. Analyze the following image of a fine.
  Your task is to extract the required details.

  **CRITICAL RULES:**
  1.  **Language:** All text output, especially the 'reason', MUST be in **Dutch**.
  2.  **Reason Specificity:** For the 'reason' field, be as specific as possible. If there is a "feitcode" (violation code) mentioned, you MUST include it in the reason. Example: "Overschrijding maximumsnelheid (feitcode VM055)".
  3.  **Date Format:** Provide the date in YYYY-MM-DD format.
  4.  **Time Format:** Provide the time in HH:mm format.
  
Photo: {{media url=photoDataUri}}`,
});

const analyzeFineFlow = ai.defineFlow(
  {
    name: 'analyzeFineFlow',
    inputSchema: AnalyzeFineInputSchema,
    outputSchema: AnalyzeFineOutputSchema,
  },
  async (input) => {
    const { output } = await analyzeFinePrompt(input);
    if (!output) {
      throw new Error('Could not analyze the fine. The model did not return an output.');
    }
    return output;
  }
);


export async function analyzeFine(input: AnalyzeFineInput): Promise<AnalyzeFineOutput> {
  return analyzeFineFlow(input);
}
