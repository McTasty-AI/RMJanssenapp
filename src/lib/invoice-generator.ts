/**
 * Utility functions to generate invoice lines from weekly log data without AI
 */

import type { WeeklyLog, Customer, InvoiceLine } from '@/lib/types';

const dayNames: Record<string, string> = {
    'maandag': 'Maandag',
    'dinsdag': 'Dinsdag',
    'woensdag': 'Woensdag',
    'donderdag': 'Donderdag',
    'vrijdag': 'Vrijdag',
    'zaterdag': 'Zaterdag',
    'zondag': 'Zondag',
};

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

function formatTime(time: { hour: number; minute: number }): string {
    return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function calculateWorkHours(
    startTime: { hour: number; minute: number },
    endTime: { hour: number; minute: number },
    breakTime: { hour: number; minute: number } = { hour: 0, minute: 0 }
): number {
    const startTotalMinutes = startTime.hour * 60 + startTime.minute;
    const endTotalMinutes = endTime.hour * 60 + endTime.minute;
    const breakTotalMinutes = breakTime.hour * 60 + breakTime.minute;
    const workTotalMinutes = endTotalMinutes - startTotalMinutes - breakTotalMinutes;
    return Math.max(0, workTotalMinutes / 60);
}

function calculateMileageRate(
    customer: Customer,
    weeklyRate?: number
): number {
    if (customer.mileageRateType === 'fixed') {
        return customer.mileageRate || 0.56;
    } else if (customer.mileageRateType === 'dot') {
        if (weeklyRate !== undefined) {
            return (customer.mileageRate || 0.56) * (1 + weeklyRate / 100);
        }
        return customer.mileageRate || 0.56;
    } else if (customer.mileageRateType === 'variable') {
        return weeklyRate !== undefined ? weeklyRate : (customer.mileageRate || 0.56);
    }
    return customer.mileageRate || 0.56;
}

function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calculateHourlyRate(
    customer: Customer,
    dayName: string
): number {
    const baseRate = customer.hourlyRate || 46.43;
    const dayLower = dayName.toLowerCase();
    
    if (dayLower === 'zaterdag' && customer.saturdaySurcharge) {
        return round2(baseRate * (customer.saturdaySurcharge / 100));
    } else if (dayLower === 'zondag' && customer.sundaySurcharge) {
        return round2(baseRate * (customer.sundaySurcharge / 100));
    }
    
    return round2(baseRate);
}

function formatBreakTime(breakTime: { hour: number; minute: number }): string {
    const totalMinutes = breakTime.hour * 60 + breakTime.minute;
    return `${totalMinutes} min pauze`;
}

export function generateInvoiceLines(
    weeklyLog: WeeklyLog,
    customer: Customer,
    weeklyRate?: number
): InvoiceLine[] {
    const lines: InvoiceLine[] = [];
    const vatRate = 21;

    for (const day of weeklyLog.days) {
        if (day.status !== 'gewerkt') {
            continue;
        }

        // Ensure breakTime exists with default value
        const breakTime = day.breakTime || { hour: 0, minute: 0 };
        
        const dateStr = formatDate(day.date);
        const dayName = dayNames[day.day] || day.day;
        const dateLabel = `${dayName} ${dateStr}`;
        
        // Build description suffix with trip number if present
        const tripNumberSuffix = day.tripNumber && day.tripNumber.trim() ? ` (Ritnr: ${day.tripNumber.trim()})` : '';

        // Calculate kilometers
        const kilometers = (day.endMileage || 0) - (day.startMileage || 0);

        // Calculate worked hours
        const workHours = calculateWorkHours(day.startTime, day.endTime, breakTime);

        // Always add hours line if hours > 0 - always show hours when data exists
        // Use default hourly rate if customer doesn't have one configured
        if (workHours > 0) {
            const hourlyRate = calculateHourlyRate(customer, day.day);
            let description: string;
            
            if (customer.showWorkTimes) {
                const startTimeStr = formatTime(day.startTime);
                const endTimeStr = formatTime(day.endTime);
                const breakTimeStr = formatBreakTime(breakTime);
                description = `${dateLabel}\nUren (${startTimeStr} - ${endTimeStr}, ${breakTimeStr})${tripNumberSuffix}`;
            } else {
                description = `${dateLabel}\nUren${tripNumberSuffix}`;
            }
            
            lines.push({
                quantity: workHours,
                description,
                unitPrice: round2(hourlyRate),
                total: round2(workHours * hourlyRate),
                vatRate,
            });
        }

        // Always add kilometers line if kilometers > 0 and customer has mileage rate configured
        if (kilometers > 0 && (customer.mileageRate || customer.mileageRateType)) {
            const mileageRate = calculateMileageRate(customer, weeklyRate);
            lines.push({
                quantity: kilometers,
                description: `${dateLabel}\nKilometers${tripNumberSuffix}`,
                unitPrice: mileageRate,
                total: kilometers * mileageRate,
                vatRate,
            });
        }

        // Add toll lines if applicable (always include toll when present)
        if (day.toll && day.toll !== 'Geen') {
            if (day.toll === 'BE' || day.toll === 'BE/DE') {
                lines.push({
                    quantity: 0,
                    description: `${dateLabel}\nTol België«${tripNumberSuffix}`,
                    unitPrice: 0,
                    total: 0,
                    vatRate,
                });
            }
            if (day.toll === 'DE' || day.toll === 'BE/DE') {
                lines.push({
                    quantity: 0,
                    description: `${dateLabel}\nTol Duitsland${tripNumberSuffix}`,
                    unitPrice: 0,
                    total: 0,
                    vatRate,
                });
            }
        }

        // Add overnight stay line if applicable
        if (day.overnightStay) {
            const overnightRate = customer.overnightRate || 50;
            lines.push({
                quantity: 1,
                description: `${dateLabel}\nOvernachting${tripNumberSuffix}`,
                unitPrice: overnightRate,
                total: overnightRate,
                vatRate,
            });
        }
    }

    return lines;
}


