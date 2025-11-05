
'use server';

import jsPDF from 'jspdf';
import 'jspdf-autotable';

declare module 'jspdf' {
    interface jsPDF {
        autoTable: (options: any) => jsPDF;
    }
}

const formatCurrency = (value: number, digits: number = 2) => {
    if (isNaN(value)) return '€ 0,00';
    return `€ ${value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const formatNumber = (value: number, digits = 2) => {
    if (isNaN(value)) return '0';
    return value.toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export async function generateCostCalculationPdfAction(data: { title: string; inputs: any; calculations: any }): Promise<Blob> {
    const doc = new jsPDF();
    const { title, inputs, calculations } = data;
    const margin = 15;
    const topMargin = 20;
    const pageHeight = doc.internal.pageSize.height;
    
    let leftY = topMargin;
    let rightY = topMargin;

    // --- Page Header ---
    doc.setFontSize(18);
    doc.text(title, margin, leftY);
    leftY += 10;
    doc.setFontSize(9);
    doc.text(`Datum: ${new Date().toLocaleDateString('nl-NL')}`, margin, leftY);
    leftY += 15;
    rightY = leftY; // Align Y positions after header
    
    const leftX = margin;
    const rightX = doc.internal.pageSize.width / 2 + 5;
    const colWidth = doc.internal.pageSize.width / 2 - margin - 5;

    const addPageIfNeeded = () => {
        if (leftY > pageHeight - 20 || rightY > pageHeight - 20) {
            doc.addPage();
            leftY = topMargin;
            rightY = topMargin;
        }
    };
    
    const addSection = (title: string, fields: [string, string, string?][], column: 'left' | 'right'): void => {
        let startX = column === 'left' ? leftX : rightX;
        let currentY = column === 'left' ? leftY : rightY;

        addPageIfNeeded();
        currentY = column === 'left' ? leftY : rightY; // Re-check after potential page add

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(title, startX, currentY);
        currentY += 8;
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        const tableBody = fields.map(field => [field[0], `${field[1]} ${field[2] || ''}`.trim()]);
        
        doc.autoTable({
            startY: currentY,
            head: [['Gegeven', 'Waarde']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: colWidth / 2 },
                1: { cellWidth: colWidth / 2, halign: 'right' }
            },
            margin: { left: startX },
            tableWidth: colWidth
        });

        if (column === 'left') {
            leftY = (doc as any).lastAutoTable.finalY + 10;
        } else {
            rightY = (doc as any).lastAutoTable.finalY + 10;
        }
    };

    const addCalcSection = (title: string, fields: [string, any][], column: 'left' | 'right'): void => {
        let startX = column === 'left' ? leftX : rightX;
        let currentY = column === 'left' ? leftY : rightY;
        
        addPageIfNeeded();
        currentY = column === 'left' ? leftY : rightY; // Re-check after potential page add

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(title, startX, currentY);
        currentY += 8;

        const tableBody = fields.map(field => [field[0], field[1]]);
        
        doc.autoTable({
            startY: currentY,
            body: tableBody,
            theme: 'plain',
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: colWidth / 2 },
                1: { cellWidth: colWidth / 2, halign: 'right', fontStyle: 'bold' }
            },
            margin: { left: startX },
            tableWidth: colWidth
        });
        
        if (column === 'left') {
            leftY = (doc as any).lastAutoTable.finalY + 10;
        } else {
            rightY = (doc as any).lastAutoTable.finalY + 10;
        }
    };

    // --- LEFT COLUMN (INPUTS) ---
    if (inputs.includeTruck) {
        addSection('Vrachtauto', [
            ['Aanschafwaarde', formatCurrency(inputs.purchaseValue)],
            ['Aantal banden', formatNumber(inputs.tireCount, 0)],
            ['Kosten banden', formatCurrency(inputs.tireCost)],
            ['Levensduur banden', formatNumber(inputs.tireLifetime, 0), 'KM'],
            ['Restwaarde', formatCurrency(inputs.residualValue)],
            ['Economische levensduur', formatNumber(inputs.economicLifetime, 0), 'jaar'],
            ['Verwachte jaar kilometers', formatNumber(inputs.expectedYearlyKm, 0), 'KM'],
            ['Brandstofverbruik', `1L per ${formatNumber(inputs.fuelConsumption, 1)} KM`],
            ['Actuele brandstofprijs', formatCurrency(inputs.fuelPrice)],
            ['Olie en smeermiddelen', formatCurrency(inputs.oilAndLubricants)],
            ['Periodiek onderhoud APK', formatCurrency(inputs.periodicMaintenance)],
            ['Reparatiekosten', formatCurrency(inputs.repairCost)],
            ['Verzekering', formatCurrency(inputs.truckInsurance)],
            ['MRB', formatCurrency(inputs.mrb)],
            ['Eurovignet', formatCurrency(inputs.eurovignette)],
            ['Rentepercentage', `${formatNumber(inputs.interestRate)} %`],
        ], 'left');
    }

    // --- RIGHT COLUMN (CALCULATIONS) ---
    addCalcSection('Specificatie Diensturen', [
        ['Diensturen', formatNumber(calculations.diensturen, 0)],
        ['Vakantie', `-${formatNumber(calculations.vakantieUren, 0)}`],
        ['ATV', `-${formatNumber(calculations.atvUren, 0)}`],
        ['Verzuim / ziek', `-${formatNumber(calculations.ziekteUren, 0)}`],
        ['Overuren 130%', `+${formatNumber(calculations.overuren130, 0)}`],
        ['Overuren 150%', `+${formatNumber(calculations.overuren150, 0)}`],
        ['Productieve uren', formatNumber(calculations.productiveHoursYear, 0)],
    ], 'right');
    
    // --- Continue adding sections and managing Y position ---
    if (inputs.includeTrailer) {
        if (leftY > rightY) addPageIfNeeded(); // Check before adding to shorter column
        addSection('Oplegger', [
            ['Aanschafwaarde', formatCurrency(inputs.trailerPurchaseValue)],
            ['Banden', formatNumber(inputs.trailerTireCount, 0)],
            ['Kosten banden', formatCurrency(inputs.trailerTireCost)],
            ['Levensduur banden', formatNumber(inputs.trailerTireLifetime, 0), 'KM'],
            ['Restwaarde', formatCurrency(inputs.trailerResidualValue)],
            ['Economische levensduur', formatNumber(inputs.trailerEconomicLifetime, 0), 'jaar'],
            ['Reparatiekosten', formatCurrency(inputs.trailerRepairCost)],
            ['Verzekering', formatCurrency(inputs.trailerInsurance)],
        ], 'left');
    }

    if (rightY > leftY) addPageIfNeeded();
    addCalcSection('Overzicht Vaste Kosten', [
        ['Afschrijving vrachtwagen', formatCurrency(calculations.fixedCosts.depreciationTruck)],
        ['Afschrijving oplegger', formatCurrency(calculations.fixedCosts.depreciationTrailer)],
        ['Rentekosten', formatCurrency(calculations.fixedCosts.interestCosts)],
        ['Verzekering vrachtwagen', formatCurrency(calculations.fixedCosts.truckInsurance)],
        ['Verzekering oplegger', formatCurrency(calculations.fixedCosts.trailerInsurance)],
        ['MRB', formatCurrency(inputs.mrb)],
        ['Eurovignet', formatCurrency(inputs.eurovignette)],
        ['Periodiek onderhoud', formatCurrency(inputs.periodicMaintenance)],
        ['Reparatiekosten oplegger', formatCurrency(calculations.fixedCosts.trailerRepairCost)],
        ['Algemene kosten', formatCurrency(calculations.generalCosts.perVehicle)],
        ['Totaal vaste kosten', formatCurrency(calculations.fixedCosts.total + calculations.generalCosts.perVehicle)],
    ], 'right');
    
     if (inputs.includePersonnel) {
         if (leftY > rightY) addPageIfNeeded();
        addSection('Personeelskosten', [
            ['Loonschaal / trede', `${inputs.salaryScale} - ${inputs.salaryStep}`],
            ['Leeftijd chauffeur', `${inputs.driverAge} jaar`],
            ['Uren 130% per week', formatNumber(inputs.overtime130, 1)],
            ['Uren 150% per week', formatNumber(inputs.overtime150, 1)],
            ['Toeslaguren 19% per week', formatNumber(inputs.surcharge19Hours, 1)],
            ['Structurele Toeslag %', `${formatNumber(inputs.structuralSurchargePercentage)} %`],
            ['Vakantiedagen per jaar', formatNumber(inputs.vacationDays, 0)],
            ['Ziektedagen per jaar', formatNumber(inputs.sickDays, 0)],
            ['Wachtdagen per jaar', formatNumber(inputs.waitingDays, 0)],
            ['Onbelaste vergoeding p/d', formatCurrency(inputs.dailyUnaxedAllowance)],
            ['Reiskilometers per dag', formatNumber(inputs.travelAllowanceKm, 0), 'KM'],
            ['Overige kosten per jaar', formatCurrency(inputs.otherCosts)],
            ['Sociale lasten', `${formatNumber(inputs.socialCharges)} %`],
            ['Pensioen', `${formatNumber(inputs.pension)} %`],
        ], 'left');
    }
    
    if (rightY > leftY) addPageIfNeeded();
     addCalcSection('Overzicht Variabele Kosten (p/km)', [
        ['Afschrijving banden', formatCurrency(calculations.variableCosts.depreciationTiresPerKm, 4)],
        ['Afschrijving banden oplegger', formatCurrency(calculations.variableCosts.depreciationTrailerTiresPerKm, 4)],
        ['Brandstofkosten', formatCurrency(calculations.variableCosts.fuelCostPerKm, 4)],
        ['Olie en smeermiddelen', formatCurrency(calculations.variableCosts.oilPerKm, 4)],
        ['Reparatiekosten', formatCurrency(calculations.variableCosts.repairCostPerKm, 4)],
        ['Totaal p/km', formatCurrency(calculations.variableCosts.totalPerKm, 4)],
    ], 'right');
    
    if (inputs.includePersonnel) {
        if (leftY > rightY) addPageIfNeeded();
        addSection('Algemene Kosten', [
            ['Algemene verzekeringen', formatCurrency(inputs.generalInsurance)],
            ['Telefoonkosten', formatCurrency(inputs.phoneCosts)],
            ['Servicewagens', formatCurrency(inputs.serviceVehicles)],
            ['Lonen directie', formatCurrency(inputs.managementSalary)],
            ['Kosten TLN', formatCurrency(inputs.tlnCosts)],
            ['Huur', formatCurrency(inputs.rent)],
            ['Aantal wagens', formatNumber(inputs.numVehicles, 0)],
        ], 'left');

        if (rightY > leftY) addPageIfNeeded();
        addCalcSection('Loonkosten Berekening (p/j)', [
            ['Basisloon (jaar)', formatCurrency(calculations.yearlyBaseSalary, 0)],
            ['Vakantiegeld', formatCurrency(calculations.vacationAllowance, 0)],
            ['Overuren 130%', formatCurrency(calculations.yearlyOvertime130, 0)],
            ['Overuren 150%', formatCurrency(calculations.yearlyOvertime150, 0)],
            ['19% Toeslag', formatCurrency(calculations.yearlyShiftSurcharge, 0)],
            ['Structurele Toeslag', formatCurrency(calculations.yearlyStructuralSurcharge, 0)],
            ['Ziektekosten', formatCurrency(calculations.costSickDays, 0)],
            ['Reiskostenvergoeding', formatCurrency(calculations.travelAllowance, 0)],
            ['Onbelaste Vergoedingen', formatCurrency(calculations.dailyUnaxedAllowanceYearly, 0)],
            ['Waarde vakantiedagen', formatCurrency(calculations.totalValueOfVacationDays, 0)],
            ['Totaal Bruto loon', formatCurrency(calculations.grossSalary)],
            [`Sociale lasten ${formatNumber(inputs.socialCharges, 1)}%`, formatCurrency(calculations.socialChargesAmount)],
            [`Pensioen ${formatNumber(inputs.pension, 1)}%`, formatCurrency(calculations.pensionAmount)],
            ['Totaal loonkosten', formatCurrency(calculations.totalPersonnelCosts)],
        ], 'right');
    } else {
         addSection('Algemene Kosten', [
            ['Algemene verzekeringen', formatCurrency(inputs.generalInsurance)],
            ['Telefoonkosten', formatCurrency(inputs.phoneCosts)],
            ['Servicewagens', formatCurrency(inputs.serviceVehicles)],
            ['Lonen directie', formatCurrency(inputs.managementSalary)],
            ['Kosten TLN', formatCurrency(inputs.tlnCosts)],
            ['Huur', formatCurrency(inputs.rent)],
            ['Aantal wagens', formatNumber(inputs.numVehicles, 0)],
        ], 'left');
    }

    // --- Final Result Section ---
    let finalYPosition = Math.max(leftY, rightY);
    addPageIfNeeded();
    finalYPosition = Math.max(leftY, rightY);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Resultaat', rightX, finalYPosition);
    
    doc.autoTable({
        startY: finalYPosition + 8,
        head: [['', 'Gecombineerd (EN)', 'All-in (OF)']],
        body: [
            ['KM tarief', formatCurrency(calculations.tariffs.combinedKmRate), formatCurrency(calculations.tariffs.allInKmRate)],
            ['Uurtarief', formatCurrency(calculations.tariffs.combinedHourRate), formatCurrency(calculations.tariffs.allInHourRate)],
        ],
        theme: 'striped',
        headStyles: { fillColor: [252, 211, 77], textColor: 20, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            0: { fontStyle: 'bold' },
            1: { halign: 'right' },
            2: { halign: 'right' }
        },
        margin: { left: rightX },
        tableWidth: colWidth
    });

    return doc.output('blob');
}
