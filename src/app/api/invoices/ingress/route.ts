
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';
import { mapAppToSupabase } from '@/lib/utils';
// Note: OCR extraction is client-side only, so we skip it in the email ingress route

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

    // 4. Extract invoice data using OCR (skip on server, will be done client-side)
    // Note: OCR extraction requires client-side execution due to PDF.js worker limitations
    // The extraction will happen when the user views/edits the invoice
    let result = null;

    // 5. Upload attachment to Supabase storage
    const timestamp = Date.now();
    const storagePath = `${timestamp}-${validAttachment.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const fileContent = await validAttachment.arrayBuffer();
    
    const { error: uploadError } = await supabase.storage
      .from('purchase_invoices')
      .upload(storagePath, new Blob([fileContent], { type: validAttachment.type }), {
        contentType: validAttachment.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      throw uploadError;
    }

    // 6. Find or create supplier
    let supplierId: string | null = null;
    if (result?.supplierName) {
      const supplierName = result.supplierName.trim();
      const { data: existingSupplier } = await supabase
        .from('suppliers')
        .select('id')
        .eq('company_name', supplierName)
        .maybeSingle();

      if (existingSupplier?.id) {
        supplierId = existingSupplier.id as string;
      } else {
        // Auto-create supplier from OCR data
        const insertPayload = mapAppToSupabase({ 
          companyName: supplierName,
          kvkNumber: result.kvkNumber,
          vatNumber: result.vatNumber,
          iban: result.iban,
          createdAt: new Date().toISOString() 
        });
        const { data: created, error: supErr } = await supabase
          .from('suppliers')
          .insert(insertPayload)
          .select('id')
          .single();
        if (supErr) {
          console.error('Error creating supplier:', supErr);
          // Continue without supplier - user can add manually
        } else if (created?.id) {
          supplierId = created.id as string;
        }
      }
    }

    // 7. Check for duplicates before saving (by supplier+invoice_number+total)
    if (supplierId && result?.invoiceNumber && result?.grandTotal) {
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

    // 8. Extract license plate from OCR result
    let invoiceLicensePlate: string | null = result?.licensePlate || null;

    // 9. Save the new invoice in Supabase with OCR extracted data
    const ocrData = result ? {
      supplierName: result.supplierName || undefined,
      invoiceNumber: result.invoiceNumber || undefined,
      invoiceDate: result.invoiceDate || undefined,
      dueDate: result.dueDate || undefined,
      subTotal: result.subTotal || undefined,
      vatTotal: result.vatTotal || undefined,
      grandTotal: result.grandTotal || undefined,
      description: result.description || undefined,
      licensePlate: result.licensePlate || undefined,
      kvkNumber: result.kvkNumber,
      vatNumber: result.vatNumber,
      iban: result.iban,
    } : null;

    const invoicePayload = mapAppToSupabase({
      supplierId: supplierId,
      invoiceNumber: result?.invoiceNumber || null,
      invoiceDate: result?.invoiceDate || new Date().toISOString().split('T')[0],
      dueDate: result?.dueDate || null,
      status: 'Nieuw',
      total: result?.grandTotal || 0,
      vatTotal: result?.vatTotal ?? null,
      licensePlate: invoiceLicensePlate,
      pdfPath: storagePath,
      ocrData: ocrData,
      createdAt: new Date().toISOString(),
    });

    const { data: inserted, error: insErr } = await supabase
      .from('purchase_invoices')
      .insert(invoicePayload)
      .select('*')
      .single();
    if (insErr) throw insErr;

    console.log(`Successfully processed and saved invoice from ${from}${result ? ' (with OCR extraction)' : ' (manual entry required)'}`);
    return NextResponse.json({ message: result ? 'Invoice processed and extracted successfully' : 'Invoice file uploaded. Manual entry required.' });

  } catch (error: any) {
    console.error('Error processing inbound email:', error);
    return NextResponse.json({ error: 'Failed to process email', details: error.message }, { status: 500 });
  }
}
