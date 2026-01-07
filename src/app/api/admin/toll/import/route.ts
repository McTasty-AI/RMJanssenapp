import { NextRequest, NextResponse } from 'next/server';
import { validateAuthenticatedRequest } from '@/lib/auth/server-auth';
import { parseTollExcelWithMapping, type TollColumnMapping } from '@/lib/toll/parse-toll-excel';
import { computeTollImportHash } from '@/lib/toll/import-hash';
import { reconcileNewTollTransactions } from '@/lib/toll/reconcile';

export const runtime = 'nodejs';

async function assertAdmin(adminClient: any, userId: string) {
  const { data, error } = await adminClient.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data || data.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const validation = await validateAuthenticatedRequest(req);
    if (!validation.valid) return validation.response;
    const { adminClient, userId } = validation;

    const forbidden = await assertAdmin(adminClient, userId);
    if (forbidden) return forbidden;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    const mappingRaw = (formData.get('column_mapping') as string | null) ?? null;
    if (!mappingRaw) {
      return NextResponse.json({ error: 'No column_mapping provided' }, { status: 400 });
    }
    let mapping: TollColumnMapping;
    try {
      mapping = JSON.parse(mappingRaw) as TollColumnMapping;
    } catch {
      return NextResponse.json({ error: 'Invalid column_mapping JSON' }, { status: 400 });
    }
    if (!mapping?.license_plate || !mapping?.transaction_date || !mapping?.amount) {
      return NextResponse.json(
        { error: 'column_mapping must include license_plate, transaction_date, and amount' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const parsed = parseTollExcelWithMapping(buffer, mapping);
    if (parsed.length === 0) {
      return NextResponse.json({ error: 'Geen regels gevonden (of de mapping past niet bij het bestand).' }, { status: 400 });
    }

    const includeTimeInHash = Boolean(mapping.transaction_time);
    const warnings: string[] = [];
    if (!includeTimeInHash) {
      warnings.push(
        'Tijdstip is niet gemapt: duplicate-detectie gebruikt nu alleen kenteken+datum+bedrag. Meerdere identieke transacties op dezelfde dag kunnen daardoor worden samengevoegd/overgeslagen.'
      );
    }

    const rows = parsed.map((r) => ({
      ...r,
      import_hash: computeTollImportHash({
        license_plate: r.license_plate,
        transaction_date: r.transaction_date,
        transaction_time: r.transaction_time,
        amount: r.amount,
        include_time: includeTimeInHash,
      }),
      status: 'new' as const,
      invoice_line_id: null as string | null,
    }));

    if (includeTimeInHash) {
      // Heuristic warning: if many rows have "00:00", time column is probably empty/unparseable for many rows
      const zeroTime = rows.filter((r) => String(r.transaction_time || '').trim() === '00:00').length;
      if (zeroTime > 0) {
        warnings.push(
          `Let op: ${zeroTime} regel(s) hebben tijdstip 00:00 (leeg of niet herkend). Dit kan nog steeds tot duplicaten leiden.`
        );
      }
    }

    // Insert using upsert+ignoreDuplicates to prevent unique constraint failures (handles races and DB duplicates)
    let inserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const batch = rows.slice(i, i + chunkSize);
      const { error, count } = await adminClient
        .from('toll_transactions')
        .upsert(batch, { onConflict: 'import_hash', ignoreDuplicates: true, count: 'exact', returning: 'minimal' });
      if (error) throw error;
      if (typeof count === 'number') inserted += count;
      else {
        // Fallback: we don't know exact inserted count; assume all were inserted
        inserted += batch.length;
      }
    }

    const reconcile = await reconcileNewTollTransactions(adminClient);

    return NextResponse.json({
      parsedRows: rows.length,
      insertedRows: inserted,
      skippedDuplicates: rows.length - inserted,
      reconcile,
      warnings,
    });
  } catch (error: any) {
    console.error('[TOLL IMPORT] Error:', error);
    return NextResponse.json(
      { error: 'Import mislukt', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

