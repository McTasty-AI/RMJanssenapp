/**
 * Central invoice service for creating invoices from weekly logs
 * Supports both automatic (on approval) and manual (from invoice page) flows
 */

import { supabase } from '@/lib/supabase/client';
import { mapSupabaseToApp } from '@/lib/utils';
import { generateInvoiceLines } from '@/lib/invoice-generator';
import type { WeeklyLog, Customer, InvoiceLine } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { addDays } from 'date-fns';

export interface InvoiceCreationOptions {
    /** Whether to include toll lines in the invoice */
    includeTollLines?: boolean;
    /** Whether to create the invoice in the database (auto-flow) or just return lines (manual-flow) */
    createInvoice?: boolean;
    /** Custom invoice date (defaults to today) */
    invoiceDate?: Date;
    /** Custom due date (defaults to invoiceDate + paymentTerm) */
    dueDate?: Date;
    /** Custom reference text */
    reference?: string;
    /** Custom footer text */
    footerText?: string;
}

export interface InvoiceCreationResult {
    /** The generated invoice lines */
    lines: InvoiceLine[];
    /** Calculated subtotal */
    subTotal: number;
    /** Calculated VAT total */
    vatTotal: number;
    /** Calculated grand total */
    grandTotal: number;
    /** Invoice ID if created in database */
    invoiceId?: string;
}

/**
 * Normalizes a weekly log by ensuring all days have required fields
 */
function normalizeWeeklyLog(log: WeeklyLog): WeeklyLog {
    return {
        ...log,
        days: log.days.map(day => ({
            ...day,
            breakTime: day.breakTime || { hour: 0, minute: 0 },
        })),
    };
}

/**
 * Adds toll lines to invoice lines based on weekly log data
 */
function addTollLines(lines: InvoiceLine[], weeklyLog: WeeklyLog): InvoiceLine[] {
    const tollLines: InvoiceLine[] = [];
    
    weeklyLog.days.forEach(day => {
        if (day.toll !== 'Geen') {
            const dayName = format(parseISO(day.date), 'EEEE dd-MM-yyyy', { locale: nl });
            if (day.toll === 'BE' || day.toll === 'BE/DE') {
                tollLines.push({
                    quantity: 0,
                    description: `${dayName}\nTol België`,
                    unitPrice: 0,
                    vatRate: 21,
                    total: 0,
                });
            }
            if (day.toll === 'DE' || day.toll === 'BE/DE') {
                tollLines.push({
                    quantity: 0,
                    description: `${dayName}\nTol Duitsland`,
                    unitPrice: 0,
                    vatRate: 21,
                    total: 0,
                });
            }
        }
    });
    
    return [...lines, ...tollLines];
}

/**
 * Calculates totals from invoice lines
 */
function calculateTotals(lines: InvoiceLine[]): { subTotal: number; vatTotal: number; grandTotal: number } {
    return lines.reduce((acc, line) => {
        const lineTotal = line.quantity * line.unitPrice;
        const vatAmount = lineTotal * (line.vatRate / 100);
        acc.subTotal += lineTotal;
        acc.vatTotal += vatAmount;
        acc.grandTotal = acc.subTotal + acc.vatTotal;
        return acc;
    }, { subTotal: 0, vatTotal: 0, grandTotal: 0 });
}

/**
 * Finds customer by license plate from weekly log
 * Exported for use in other modules (e.g., approval validation)
 * Only considers days with status 'gewerkt' (worked)
 */
export async function findCustomerByLicensePlate(weeklyLog: WeeklyLog): Promise<Customer | null> {
    const plateCounts: Record<string, number> = {};
    
    // Only count plates from days that were worked
    weeklyLog.days.forEach(day => {
        if (day.licensePlate && day.status === 'gewerkt') {
            plateCounts[day.licensePlate] = (plateCounts[day.licensePlate] || 0) + 1;
        }
    });

    if (Object.keys(plateCounts).length === 0) {
        return null;
    }
    
    const mainLicensePlate = Object.keys(plateCounts).reduce((a, b) => 
        plateCounts[a] > plateCounts[b] ? a : b
    );

    const { data: customers, error } = await supabase
        .from('customers')
        .select('*')
        .contains('assigned_license_plates', [mainLicensePlate]);

    if (error || !customers || customers.length === 0) {
        return null;
    }
    
    return mapSupabaseToApp<Customer>(customers[0]);
}

/**
 * Fetches weekly rate for customer if needed
 */
async function fetchWeeklyRate(customer: Customer, weekId: string): Promise<number | undefined> {
    if (customer.mileageRateType !== 'dot' && customer.mileageRateType !== 'variable') {
        return undefined;
    }

    const { data: rateData } = await supabase
        .from('weekly_rates')
        .select('rate')
        .eq('week_id', weekId)
        .eq('customer_id', customer.id)
        .single();

    return rateData?.rate;
}

/**
 * Main function to create invoice from weekly log
 * Can be used for both automatic (on approval) and manual (from invoice page) flows
 */
export async function createInvoiceFromWeeklyLog(
    weeklyLog: WeeklyLog,
    customer?: Customer,
    weeklyRate?: number,
    options: InvoiceCreationOptions = {}
): Promise<InvoiceCreationResult> {
    const {
        includeTollLines = false,
        createInvoice = false,
        invoiceDate = new Date(),
        dueDate,
        reference,
        footerText,
    } = options;

    // Normalize weekly log
    const normalizedLog = normalizeWeeklyLog(weeklyLog);

    // Find customer if not provided (for automatic flow)
    let finalCustomer = customer;
    if (!finalCustomer) {
        finalCustomer = await findCustomerByLicensePlate(normalizedLog);
        if (!finalCustomer) {
            throw new Error('Geen klant gevonden voor kenteken in weekstaat.');
        }
    }

    // Fetch weekly rate if not provided and needed
    let finalWeeklyRate = weeklyRate;
    if (finalWeeklyRate === undefined && finalCustomer) {
        finalWeeklyRate = await fetchWeeklyRate(finalCustomer, normalizedLog.weekId);
    }

    // Generate invoice lines (now includes toll lines automatically)
    let lines = generateInvoiceLines(normalizedLog, finalCustomer!, finalWeeklyRate);

    // Note: Toll lines are now included directly in generateInvoiceLines
    // So we don't need to add them separately anymore
    // The includeTollLines option is kept for backward compatibility but no longer needed

    // Calculate totals
    const totals = calculateTotals(lines);

    // Create invoice in database if requested (automatic flow)
    let invoiceId: string | undefined;
    if (createInvoice && finalCustomer) {
        const [year, weekNumber] = normalizedLog.weekId.split('-');
        
        // Determine main license plate for reference
        const plateCounts: Record<string, number> = {};
        normalizedLog.days.forEach(day => {
            if (day.licensePlate) {
                plateCounts[day.licensePlate] = (plateCounts[day.licensePlate] || 0) + 1;
            }
        });
        const mainLicensePlate = Object.keys(plateCounts).reduce((a, b) => 
            plateCounts[a] > plateCounts[b] ? a : b, 
            Object.keys(plateCounts)[0] || ''
        );

        const finalDueDate = dueDate || addDays(invoiceDate, finalCustomer.paymentTerm || 30);
        const finalReference = reference || `Week ${weekNumber} - ${year} (${mainLicensePlate})`;
        const finalFooterText = footerText || 
            'We verzoeken u vriendelijk het bovenstaande bedrag voor de vervaldatum te voldoen op onze bankrekening onder vermelding van het factuurnummer.';

        const { data: newInvoice, error: invoiceError } = await supabase
            .from('invoices')
            .insert({
                invoice_number: '',
                status: 'concept',
                customer_id: finalCustomer.id,
                invoice_date: invoiceDate.toISOString(),
                due_date: finalDueDate.toISOString(),
                reference: finalReference,
                sub_total: totals.subTotal,
                vat_total: totals.vatTotal,
                grand_total: totals.grandTotal,
                footer_text: finalFooterText,
                show_daily_totals: finalCustomer.showDailyTotals ?? false,
                show_weekly_totals: finalCustomer.showWeeklyTotals ?? false,
            })
            .select()
            .single();

        if (invoiceError || !newInvoice) {
            throw new Error(`Fout bij aanmaken factuur: ${invoiceError?.message || 'Onbekende fout'}`);
        }

        invoiceId = newInvoice.id;

        // Insert invoice lines
        const dbInvoiceLines = lines.map(l => ({
            invoice_id: newInvoice.id,
            quantity: l.quantity,
            description: l.description,
            unit_price: l.unitPrice,
            vat_rate: l.vatRate,
            total: l.total,
        }));

        const { error: linesError } = await supabase
            .from('invoice_lines')
            .insert(dbInvoiceLines);

        if (linesError) {
            throw new Error(`Fout bij aanmaken factuurregels: ${linesError.message}`);
        }
    }

    return {
        lines,
        ...totals,
        invoiceId,
    };
}

/**
 * Helper function for manual flow - just generates invoice lines without creating invoice
 */
export async function generateInvoiceLinesFromWeeklyLog(
    weeklyLog: WeeklyLog,
    customer: Customer,
    weeklyRate?: number
): Promise<InvoiceLine[]> {
    const normalizedLog = normalizeWeeklyLog(weeklyLog);
    return generateInvoiceLines(normalizedLog, customer, weeklyRate);
}

/**
 * Helper function for automatic flow - creates invoice on approval
 * Returns the created invoice result with customer name for display
 */
export async function createInvoiceOnApproval(
    weeklyLog: WeeklyLog,
    options?: Omit<InvoiceCreationOptions, 'createInvoice' | 'includeTollLines'>
): Promise<InvoiceCreationResult & { customerName: string }> {
    const result = await createInvoiceFromWeeklyLog(weeklyLog, undefined, undefined, {
        ...options,
        createInvoice: true,
        includeTollLines: true,
    });

    // Find customer name for display
    const customer = await findCustomerByLicensePlate(weeklyLog);
    const customerName = customer?.companyName || 'Onbekende klant';

    return {
        ...result,
        customerName,
    };
}

