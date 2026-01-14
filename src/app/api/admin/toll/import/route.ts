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
    
    // Check if time is actually available in the parsed data (even if not explicitly mapped)
    // If most transactions have valid times (not "00:00"), we should use them for uniqueness
    const validTimes = parsed.filter(r => r.transaction_time && r.transaction_time !== '00:00').length;
    const hasValidTimes = validTimes > parsed.length * 0.5; // More than 50% have valid times
    
    // Use time in hash if explicitly mapped OR if valid times are available
    const shouldUseTimeInHash = includeTimeInHash || hasValidTimes;
    
    const warnings: string[] = [];
    if (!includeTimeInHash && !hasValidTimes) {
      warnings.push(
        'Tijdstip is niet gemapt en niet beschikbaar: alle transacties worden geïmporteerd. Controleer op duplicaten indien nodig.'
      );
    } else if (!includeTimeInHash && hasValidTimes) {
      warnings.push(
        'Tijdstip kolom niet expliciet gemapt, maar tijd wordt automatisch gebruikt voor duplicate-detectie.'
      );
    }

    const rows = parsed.map((r, index) => ({
      ...r,
      transaction_time: r.transaction_time || '00:00', // Ensure transaction_time is never null
      import_hash: computeTollImportHash({
        license_plate: r.license_plate,
        transaction_date: r.transaction_date,
        transaction_time: r.transaction_time || '00:00',
        amount: r.amount,
        include_time: shouldUseTimeInHash, // Use time if available, even if not explicitly mapped
        country: r.country,
        location: r.location,
        rowIndex: index, // Use row index as fallback for uniqueness
      }),
      status: 'new' as const,
      invoice_line_id: null as string | null,
    }));

    // Check for duplicate import_hashes within the parsed rows
    const hashCounts = new Map<string, number>();
    rows.forEach((row, index) => {
      const count = hashCounts.get(row.import_hash) || 0;
      hashCounts.set(row.import_hash, count + 1);
      if (count > 0) {
        console.log(`[TOLL IMPORT] Duplicate hash detected at row ${index + 1}:`, {
          plate: row.license_plate,
          date: row.transaction_date,
          time: row.transaction_time,
          amount: row.amount,
          country: row.country,
          location: row.location,
          hash: row.import_hash
        });
      }
    });

    if (shouldUseTimeInHash) {
      // Heuristic warning: if many rows have "00:00", time column is probably empty/unparseable for many rows
      const zeroTime = rows.filter((r) => String(r.transaction_time || '').trim() === '00:00').length;
      if (zeroTime > 0 && zeroTime < rows.length) {
        warnings.push(
          `Let op: ${zeroTime} regel(s) hebben tijdstip 00:00 (leeg of niet herkend). Deze kunnen mogelijk als duplicaten worden gezien.`
        );
      }
    }

    // Insert all rows without duplicate checking
    // If unique constraint violations occur, they will be silently ignored
    let inserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const batch = rows.slice(i, i + chunkSize);
      
      // Ensure all required fields are present and transaction_time is never null
      const sanitizedBatch = batch.map(row => ({
        ...row,
        transaction_time: row.transaction_time || '00:00', // Ensure never null
        vat_rate: row.vat_rate ?? 21, // Ensure vat_rate has a default
      }));
      
      // Try batch insert first
      const { error: batchError, count: batchCount } = await adminClient
        .from('toll_transactions')
        .insert(sanitizedBatch, { count: 'exact' });
      
      if (batchError) {
        // If unique constraint violation, try inserting one by one and skip duplicates silently
        if (batchError.code === '23505' && batchError.message?.includes('import_hash')) {
          let skippedCount = 0;
          for (const row of sanitizedBatch) {
            const { error: singleError } = await adminClient
              .from('toll_transactions')
              .insert(row);
            // Silently skip duplicates (unique constraint violations)
            if (!singleError) {
              inserted++;
            } else if (singleError.code === '23505') {
              skippedCount++;
              console.log('[TOLL IMPORT] Skipped duplicate:', {
                plate: row.license_plate,
                date: row.transaction_date,
                time: row.transaction_time,
                amount: row.amount,
                hash: row.import_hash
              });
            } else {
              // Only throw if it's not a duplicate error
              console.error('[TOLL IMPORT] Single row insert error:', singleError);
              throw singleError;
            }
          }
          if (skippedCount > 0) {
            console.log(`[TOLL IMPORT] Skipped ${skippedCount} duplicate(s) in batch`);
          }
        } else {
          // Other errors should be thrown
          console.error('[TOLL IMPORT] Batch insert error:', batchError);
          throw batchError;
        }
      } else {
        // Successfully inserted batch
        if (typeof batchCount === 'number') {
          inserted += batchCount;
        } else {
          inserted += sanitizedBatch.length;
        }
      }
    }

    // Only run reconcile if we actually inserted new rows
    let reconcile: { processedTransactions: number; matchedTransactions: number; unmatchedGroups: Array<{ license_plate: string; transaction_date: string; reason: string }>; updatedInvoiceLines: number } = { processedTransactions: 0, matchedTransactions: 0, unmatchedGroups: [], updatedInvoiceLines: 0 };
    if (inserted > 0) {
      try {
        reconcile = await reconcileNewTollTransactions(adminClient);
      } catch (reconcileError: any) {
        console.error('[TOLL IMPORT] Reconcile error (non-fatal):', reconcileError);
        // Don't fail the import if reconcile fails - user can run it manually
        reconcile = {
          processedTransactions: 0,
          matchedTransactions: 0,
          unmatchedGroups: [],
          updatedInvoiceLines: 0,
        };
      }
    }

    return NextResponse.json({
      parsedRows: rows.length,
      insertedRows: inserted,
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

