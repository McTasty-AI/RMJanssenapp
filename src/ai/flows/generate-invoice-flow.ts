
'use server';

/**
 * @fileOverview An AI flow to generate invoice data from a weekly log.
 *
 * - generateInvoiceData - A function that handles the invoice data generation.
 * - InvoiceData - The return type for the generateInvoiceData function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { WeeklyLog, Customer } from '@/lib/types';
import { weeklyLogSchema, customerSchema } from '@/lib/schemas';
// Firestore not used here anymore


const InvoiceGenerationInputSchema = z.object({
  weeklyLog: weeklyLogSchema.describe("The driver's weekly log data, containing daily activities."),
  customer: customerSchema.describe("The customer's data, containing their billing information and rates."),
  weeklyRate: z.number().optional().describe('The specific rate for this customer for this week. This is either the DOT percentage or the variable mileage rate, depending on the customer\'s settings.'),
});


const InvoiceLineSchema = z.object({
  quantity: z.number().describe('The quantity for the line item (e.g., number of hours or kilometers).'),
  description: z.string().describe('A detailed description of the line item. This should be a multi-line string. The first line is the day name and date (e.g., "Dinsdag 21-01-2025"). The second line is a description like "Kilometers", "Uren", or "Overnachting".'),
  unitPrice: z.number().describe('The price per unit.'),
  total: z.number().describe('The total amount for the line (quantity * unitPrice).'),
  vatRate: z.number().describe('The VAT rate for this line item, as a number (e.g., 21 for 21%).'),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

const InvoiceDataSchema = z.object({
  lines: z.array(InvoiceLineSchema).describe('An array of invoice lines generated from the weekly log.'),
});
export type InvoiceData = z.infer<typeof InvoiceDataSchema>;


const generateInvoiceDataPrompt = ai.definePrompt({
    name: 'generateInvoiceDataPrompt',
    input: { schema: InvoiceGenerationInputSchema },
    output: { schema: InvoiceDataSchema },
    prompt: `You are an invoicing assistant for a transport company. 
    Analyze the provided JSON data to create detailed invoice lines.

    The input contains 'weeklyLog', 'customer', and an optional 'weeklyRate'. The 'kilometers' field for each day is pre-calculated.

    Your task is to:
    1. Iterate through each day in the 'weeklyLog.days' array.
    2. If a day's status is 'gewerkt' (worked), create invoice lines based on the 'customer.billingType'.
        - 'hourly': Create one line for hours.
        - 'mileage': Create one line for kilometers if 'kilometers' > 0.
        - 'combined': Create two separate lines: one for hours and one for kilometers if 'kilometers' > 0.
    3. For KILOMETERS:
        - The 'quantity' is the driven kilometers from the 'kilometers' field.
        - The 'description' is a multi-line string: "DayName DD-MM-YYYY\\nKilometers".
        - Calculate the 'unitPrice' based on 'customer.mileageRateType':
            - If 'fixed', use 'customer.mileageRate' (default 0.56 if not set).
            - If 'dot', calculate: customer.mileageRate * (1 + (weeklyRate / 100)).
            - If 'variable', use the provided 'weeklyRate'.
            - If the logic leads to an invalid price or weeklyRate is not provided, use customer.mileageRate or the default of 0.56.
    4. For HOURS:
        - **CRITICAL**: Calculate worked hours:
          a. Calculate total minutes: (endTime in minutes) - (startTime in minutes).
          b. Calculate total break minutes: (breakTime.hour * 60) + (breakTime.minute).
          c. Subtract break from total: (total minutes - total break minutes).
          d. Convert to hours: (result from c) / 60.
          e. This final value is the 'quantity'.
        - The 'description' depends on 'customer.showWorkTimes':
            - If true: "DayName DD-MM-YYYY\\nUren (HH:mm - HH:mm, X min pauze)". Use start, end, and break times. Format the break as "X min pauze".
            - If false or not set: "DayName DD-MM-YYYY\\nUren".
        - The 'unitPrice' calculation is critical:
            a. START with the base hourly rate from 'customer.hourlyRate'. If not available or zero, use 46.43.
            b. CHECK the day of the week from the description.
            c. If the day is ZATERDAG (Saturday), you MUST multiply the base hourly rate by (customer.saturdaySurcharge / 100). For example, if the surcharge is 120, the formula is (base rate * 1.2).
            d. If the day is ZONDAG (Sunday), you MUST multiply the base hourly rate by (customer.sundaySurcharge / 100). For example, if the surcharge is 150, the formula is (base rate * 1.5).
            e. For all other workdays (maandag to vrijdag), the unitPrice is simply the base hourly rate. DO NOT apply any surcharge.
    5. For OVERNIGHT STAYS:
        - If 'overnightStay' is true, add a separate line item.
        - 'quantity' is 1.
        - 'description' is "DayName DD-MM-YYYY\\nOvernachting".
        - 'unitPrice' is 'customer.overnightRate'. If not set, use a default of 50.
    6. For DAILY EXPENSE ALLOWANCE (Onkostenvergoeding):
        - **DO NOT** create a line item for 'customer.dailyExpenseAllowance'. This is for payroll only and should not be on the invoice for the customer.
    7. Set the 'vatRate' for all lines to 21.
    8. Calculate the 'total' for each line (quantity * unitPrice).
    9. Exclude any days that are not 'gewerkt' or have no hours/kilometers where applicable.
    
    Weekly Log Data (with pre-calculated kilometers):
    \`\`\`json
    {{{json weeklyLog}}}
    \`\`\`

    Customer Financial Data:
    \`\`\`json
    {{{json customer}}}
    \`\`\`
    
    Weekly Rate for this customer (DOT % or variable rate): {{{weeklyRate}}}
    `,
});


const generateInvoiceDataFlow = ai.defineFlow(
  {
    name: 'generateInvoiceDataFlow',
    inputSchema: InvoiceGenerationInputSchema,
    outputSchema: InvoiceDataSchema,
  },
  async (input) => {
    const maxRetries = 3;
    let lastError: any = null;

    if ((input.customer.mileageRateType === 'dot' || input.customer.mileageRateType === 'variable') && input.weeklyRate === undefined) {
        console.warn(`[generateInvoiceDataFlow] weeklyRate is undefined for customer ${input.customer.companyName} with rate type '${input.customer.mileageRateType}'. Falling back to base rate.`);
    }


    // Pre-calculate kilometers for each day and add it to the log data for the prompt
    const daysWithKilometers = input.weeklyLog.days.map(day => {
        const kilometers = (day.endMileage || 0) - (day.startMileage || 0);
        return {
            ...day,
            kilometers: kilometers > 0 ? kilometers : 0, // Ensure kilometers is always a number
        };
    });

    const flowInputWithKilometers = {
        ...input,
        weeklyLog: {
            ...input.weeklyLog,
            days: daysWithKilometers,
        },
    };


    for (let i = 0; i < maxRetries; i++) {
        try {
            // Use the enriched input for the prompt
            const { output } = await generateInvoiceDataPrompt(flowInputWithKilometers);
            if (!output) {
                throw new Error('Could not generate invoice data. The model did not return an output.');
            }
            return output;
        } catch (e: any) {
            lastError = e;
            // Check for a 503 Service Unavailable error and retry
            if (e.message && e.message.includes('503')) {
                console.warn(`Attempt ${i + 1} failed with 503. Retrying in 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            // For other errors, fail immediately
            throw e;
        }
    }
    
    console.error("Failed to generate invoice data after multiple retries.", lastError);
    throw new Error('De AI-service is momenteel overbelast. Probeer het later opnieuw.');
  }
);


export async function generateInvoiceData(weeklyLog: WeeklyLog, customer: Customer, weeklyRate?: number): Promise<InvoiceData> {
    
    const flowInput = {
        weeklyLog: weeklyLog,
        customer: customer,
        weeklyRate: weeklyRate,
    };

    return generateInvoiceDataFlow(flowInput);
}
