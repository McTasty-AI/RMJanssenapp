
'use server';

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { Invoice, CompanyProfile, InvoiceLine } from '@/lib/types';
import { format } from 'date-fns';

// Helper function to format currency with Dutch formatting (punt voor duizenden, komma voor centen)
function formatCurrency(amount: number): string {
    return `€ ${amount.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

declare module 'jspdf' {
    interface jsPDF {
        autoTable: (options: any) => jsPDF;
    }
}


export async function generatePdfAction(invoice: Omit<Invoice, 'id' | 'status' | 'createdAt'>, companyProfile: CompanyProfile, logoDataUri: string | null): Promise<Blob> {
    const doc = new jsPDF();
    
    const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
    const margin = 15;

    // Add logo if available (left side, top)
    if (logoDataUri) {
        try {
            // Desired width for logo (adjust this to make it wider/more stretched)
            const logoWidth = 70; // Increased from 60 to make it wider
            
            // Extract image format from data URI
            const imageFormat = logoDataUri.match(/data:image\/(\w+);/)?.[1] || 'PNG';
            
            // Add image at top left with specified width
            // jsPDF will automatically calculate height to maintain aspect ratio
            // We pass undefined for height to let jsPDF maintain aspect ratio
            const img = doc.getImageProperties(logoDataUri);
            const aspectRatio = img.width / img.height;
            const logoHeight = logoWidth / aspectRatio;
            
            // Ensure logo doesn't exceed max height
            const maxHeight = 30;
            let finalWidth = logoWidth;
            let finalHeight = logoHeight;
            
            if (logoHeight > maxHeight) {
                finalHeight = maxHeight;
                finalWidth = maxHeight * aspectRatio;
            }
            
            doc.addImage(logoDataUri, imageFormat, margin, margin, finalWidth, finalHeight);
        } catch (error) {
            console.error('Error adding logo to PDF:', error);
            // Continue without logo if there's an error
        }
    }

    // Company Info (Right Aligned)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    let companyY = margin + 5; // Start a bit lower than the top margin
    doc.text(companyProfile.companyName, pageWidth - margin, companyY, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    companyY += 5;
    doc.text(`${companyProfile.street} ${companyProfile.houseNumber}`, pageWidth - margin, companyY, { align: 'right' });
    companyY += 5;
    doc.text(`${companyProfile.postalCode} ${companyProfile.city}`, pageWidth - margin, companyY, { align: 'right' });
    
    companyY += 7; // Add space
    doc.text(companyProfile.email, pageWidth - margin, companyY, { align: 'right' });
    companyY += 5;
    doc.text(companyProfile.phone, pageWidth - margin, companyY, { align: 'right' });
    
    companyY += 7; // Add space
    doc.text(`KVK: ${companyProfile.kvkNumber}`, pageWidth - margin, companyY, { align: 'right' });
    companyY += 5;
    doc.text(`BTW: ${companyProfile.vatNumber}`, pageWidth - margin, companyY, { align: 'right' });
    companyY += 5;
    doc.text(`Bank: ${companyProfile.iban}`, pageWidth - margin, companyY, { align: 'right' });


    // Bill to (Left aligned, below logo if present, otherwise at margin + 40)
    let billToY = margin + (logoDataUri ? 35 : 40); // Adjust position based on logo presence 
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.customer.companyName, margin, billToY);
    billToY += 5;
    doc.setFont('helvetica', 'normal');
    // Add T.a.v. if contact name exists
    if(invoice.customer.contactName) {
        doc.text(`T.a.v. ${invoice.customer.contactName}`, margin, billToY);
        billToY += 5;
    }
    doc.text(`${invoice.customer.street} ${invoice.customer.houseNumber}`, margin, billToY);
    billToY += 5;
    doc.text(`${invoice.customer.postalCode} ${invoice.customer.city}`, margin, billToY);


    // Invoice Details Section (Bottom of the header)
    let detailsY = margin + (logoDataUri ? 75 : 80); // Adjust position if logo is present
    
    // Left side: Factuur & Kenmerk
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    const invoiceNumberText = invoice.invoiceNumber || 'Concept';
    doc.text(`Factuur ${invoiceNumberText}`, margin, detailsY);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    if (invoice.reference) {
        detailsY += 6;
        doc.text(`Kenmerk:`, margin, detailsY);
        doc.text(invoice.reference, margin + 20, detailsY);
    }
    
    // Right side: Factuurdatum & Vervaldatum
    let rightDetailsX = pageWidth - margin - 50;
    doc.text('Factuurdatum:', rightDetailsX, detailsY - 6);
    doc.text(format(new Date(invoice.invoiceDate), 'dd-MM-yyyy'), pageWidth - margin, detailsY - 6, { align: 'right' });
    
    doc.text('Vervaldatum:', rightDetailsX, detailsY);
    doc.text(format(new Date(invoice.dueDate), 'dd-MM-yyyy'), pageWidth - margin, detailsY, { align: 'right' });
    
    // Table
    const tableBody: any[] = [];
    let currentDay = '';
    let daySubtotal = 0;
    let weekTotalHours = 0;
    let weekTotalKms = 0;

    const processDaySubtotal = () => {
        if (invoice.showDailyTotals && currentDay && daySubtotal > 0) {
            tableBody.push([
                {
                    content: `Totaal ${currentDay}`,
                    colSpan: 4,
                    styles: { halign: 'right', fontStyle: 'bold' },
                },
                {
                    content: formatCurrency(daySubtotal),
                    styles: { halign: 'right', fontStyle: 'bold' },
                }
            ]);
        }
        daySubtotal = 0;
    };

    for (const line of invoice.lines) {
        const lineDescription = line.description?.toLowerCase() || '';
        const dayMatch = lineDescription.match(/^(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)/i);
        const dayName = dayMatch ? dayMatch[0].charAt(0).toUpperCase() + dayMatch[0].slice(1) : '';

        if (dayName && dayName !== currentDay) {
            processDaySubtotal();
            currentDay = dayName;
        }

        const isMileageRate = ['kilometers', 'km', 'dot', 'diesel'].some(keyword => lineDescription.includes(keyword));
        const isHourRate = lineDescription.includes('uren');

        let unitPriceString: string;
        const unitPrice = typeof line.unitPrice === 'string' ? parseFloat(line.unitPrice) : line.unitPrice;
        
        if (!isNaN(unitPrice)) {
            // Format unit price with proper Dutch formatting
            unitPriceString = `€ ${unitPrice.toLocaleString('nl-NL', { minimumFractionDigits: isMileageRate ? 4 : 2, maximumFractionDigits: 4 })}`;
        } else {
            unitPriceString = '€ 0,00';
        }
        
        const lineTotal = (line.quantity || 0) * (unitPrice || 0);

        if (isHourRate) weekTotalHours += line.quantity || 0;
        if (isMileageRate) weekTotalKms += line.quantity || 0;

        tableBody.push([
            line.description,
            line.quantity.toLocaleString('nl-NL'),
            unitPriceString,
            `${line.vatRate}%`,
            formatCurrency(lineTotal)
        ]);

        if (isHourRate || isMileageRate) {
            daySubtotal += lineTotal;
        }
    }
    processDaySubtotal(); // Process the last day

    if (invoice.showWeeklyTotals) {
        tableBody.push([
            {
                content: `Totaal uren: ${weekTotalHours.toFixed(2)} | Totaal kilometers: ${weekTotalKms.toFixed(2)}`,
                colSpan: 5,
                styles: { halign: 'left', fontStyle: 'bold', fillColor: [230, 230, 230], textColor: 20 },
            }
        ]);
    }


    doc.autoTable({
        startY: detailsY + 15,
        head: [['Omschrijving', 'Aantal', 'Tarief', 'BTW %', 'Totaal']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [230, 230, 230], textColor: 20 },
        styles: { cellPadding: 3, fontSize: 9 },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { halign: 'right', cellWidth: 20 },
            2: { halign: 'right', cellWidth: 25 },
            3: { halign: 'right', cellWidth: 20 },
            4: { halign: 'right', cellWidth: 30 }
        }
    });

    // Calculate totals per VAT rate
    // Unit prices are exclusive of VAT, so we calculate VAT on top of the subtotal
    const vatGroups: Record<number, { subTotal: number; vatAmount: number }> = {};
    for (const line of invoice.lines) {
        const vatRate = line.vatRate || 0;
        const unitPrice = typeof line.unitPrice === 'string' ? parseFloat(line.unitPrice) : line.unitPrice || 0;
        const quantity = line.quantity || 0;
        const lineSubTotal = quantity * unitPrice; // Exclusief BTW
        const lineVatAmount = lineSubTotal * (vatRate / 100); // BTW bedrag
        
        if (!vatGroups[vatRate]) {
            vatGroups[vatRate] = { subTotal: 0, vatAmount: 0 };
        }
        vatGroups[vatRate].subTotal += lineSubTotal;
        vatGroups[vatRate].vatAmount += lineVatAmount;
    }

    // Totals
    const finalY = (doc as any).lastAutoTable.finalY;
    const totalsX = pageWidth - margin;
    let totalsY = finalY + 10;
    
    if (totalsY > pageHeight - 40) {
        doc.addPage();
        totalsY = 20;
    }
    
    doc.setFontSize(10);
    doc.text('Subtotaal:', totalsX - 35, totalsY, { align: 'right' });
    doc.text(formatCurrency(invoice.subTotal), totalsX, totalsY, { align: 'right' });
    totalsY += 7;

    // Show VAT breakdown per rate
    const sortedVatRates = Object.keys(vatGroups).map(Number).sort((a, b) => b - a);
    for (const vatRate of sortedVatRates) {
        const group = vatGroups[vatRate];
        doc.text(`${vatRate}% btw over ${formatCurrency(group.subTotal)}:`, totalsX - 35, totalsY, { align: 'right' });
        doc.text(formatCurrency(group.vatAmount), totalsX, totalsY, { align: 'right' });
        totalsY += 7;
    }

    totalsY += 2;
    doc.setDrawColor(150);
    doc.line(totalsX - 55, totalsY, totalsX, totalsY);
    totalsY += 7;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Totaal:', totalsX - 35, totalsY, { align: 'right' });
    doc.text(formatCurrency(invoice.grandTotal), totalsX, totalsY, { align: 'right' });
    
    // Footer text
    if (invoice.footerText) {
        const footerY = pageHeight - 20;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100);
        const pageNumber = (doc as any).getNumberOfPages ? (doc as any).getNumberOfPages() : (doc as any).internal?.getNumberOfPages?.() || 1;
        doc.setPage(pageNumber);
        doc.text(invoice.footerText, pageWidth / 2, footerY, { align: 'center', maxWidth: pageWidth - 40 });
    }

    return doc.output('blob');
}
