
import { NextRequest, NextResponse } from 'next/server';
import { analyzePurchaseInvoice } from '@/ai/flows/analyze-purchase-invoice-flow';
import { getAdminClient } from '@/lib/supabase/server';
import { mapAppToSupabase } from '@/lib/utils';

// IMPORTANT: This key must be kept secret and match the key in your email provider's webhook settings.
const INGRESS_API_KEY = process.env.EMAIL_INGRESS_API_KEY;

export async function POST(req: NextRequest) {
  // 1. Authenticate the request
  const apiKey = req.headers.get('x-api-key');
  if (!INGRESS_API_KEY || apiKey !== INGRESS_API_KEY) {
    console.warn('Unauthorized request to email ingress');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getAdminClient();
    // 2. Parse the incoming email data using modern FormData
    const formData = await req.formData();
    const from = formData.get('from') as string;
    const attachments = formData.getAll('attachments') as File[];

    if (!attachments || attachments.length === 0) {
      return NextResponse.json({ message: 'No attachment found, skipping.' });
    }

    // 3. Find the first valid attachment (PDF or image)
    const validAttachment = attachments.find(att =>
        att.type && (att.type.includes('pdf') || att.type.startsWith('image/'))
    );

    if (!validAttachment) {
      return NextResponse.json({ message: 'No processable attachment (PDF/Image) found.' });
    }

    // 4. Convert attachment to data URI for the AI
    const fileContent = await validAttachment.arrayBuffer();
    const dataUri = `data:${validAttachment.type};base64,${Buffer.from(fileContent).toString('base64')}`;


    // 5. Analyze the invoice using the existing Genkit flow
    const result = await analyzePurchaseInvoice({ invoiceDataUri: dataUri });

    // 6. Find or create supplier
    let supplierId: string | null = null;
    if (result.supplierName) {
      const supplierName = result.supplierName.trim();
      const { data: existingSupplier } = await supabase
        .from('suppliers')
        .select('id')
        .eq('company_name', supplierName)
        .maybeSingle();

      if (existingSupplier?.id) {
        supplierId = existingSupplier.id as string;
      } else {
        const insertPayload = mapAppToSupabase({ companyName: supplierName, createdAt: new Date().toISOString() });
        const { data: created, error: supErr } = await supabase
          .from('suppliers')
          .insert(insertPayload)
          .select('id')
          .single();
        if (supErr) throw supErr;
        supplierId = created.id as string;
      }
    }

    // 7. Check for duplicates before saving (by supplier+invoice_number+total)
    if (supplierId && result.invoiceNumber && result.grandTotal) {
      const { data: dup, error: dupErr } = await supabase
        .from('purchase_invoices')
        .select('id')
        .eq('supplier_id', supplierId)
        .eq('invoice_number', result.invoiceNumber)
        .eq('total', result.grandTotal)
        .limit(1);
      if (dupErr) throw dupErr;
      if (dup && dup.length > 0) {
        console.log(`Duplicate invoice skipped: ${result.invoiceNumber} from ${result.supplierName}`);
        return NextResponse.json({ message: 'Duplicate invoice detected and skipped.' });
      }
    }

    // 8. Save the new invoice in Supabase
    const invoicePayload = mapAppToSupabase({
      supplierId: supplierId,
      invoiceNumber: result.invoiceNumber || null,
      invoiceDate: result.invoiceDate || new Date().toISOString(),
      dueDate: result.dueDate || null,
      status: 'Nieuw',
      total: result.grandTotal,
      vatTotal: result.vatTotal ?? null,
      licensePlate: null,
      createdAt: new Date().toISOString(),
    });

    const { data: inserted, error: insErr } = await supabase
      .from('purchase_invoices')
      .insert(invoicePayload)
      .select('*')
      .single();
    if (insErr) throw insErr;

    // 9. Insert lines if present
    if (result.lines && result.lines.length > 0) {
      const lineRows = result.lines.map(l => ({
        purchase_invoice_id: inserted.id,
        description: l.description,
        quantity: l.quantity ?? 1,
        unit_price: l.unitPrice ?? 0,
        vat_rate: l.vatRate ?? 21,
        total: l.total ?? (l.quantity ?? 1) * (l.unitPrice ?? 0),
        category: null,
      }));
      const { error: linesErr } = await supabase
        .from('purchase_invoice_lines')
        .insert(lineRows);
      if (linesErr) throw linesErr;
    }

    // Note: attachment storage into Supabase bucket can be added later if needed.

    console.log(`Successfully processed and saved invoice from ${from}`);
    return NextResponse.json({ message: 'Invoice processed successfully' });

  } catch (error: any) {
    console.error('Error processing inbound email:', error);
    return NextResponse.json({ error: 'Failed to process email', details: error.message }, { status: 500 });
  }
}
