import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';
import { validateAuthenticatedRequest } from '@/lib/auth/server-auth';

function sanitizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Allow-list of buckets this endpoint may write to
const ALLOWED_BUCKETS = new Set([
  'company_assets',
  'receipts',
  'fines',
  'invoices',
  'purchase_invoices',
  'vehicle_documents',
]);

function resolveBucketAndPrefix(path: string) {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) throw new Error('Invalid path');
  let bucket = segments[0];
  // Backward compat: map old 'declarations' to 'receipts' bucket
  if (bucket === 'declarations') bucket = 'receipts';
  const prefix = segments.slice(1).join('/');
  return { bucket, prefix };
}

export async function POST(req: NextRequest) {
  try {
    // Validate authenticated user
    const validation = await validateAuthenticatedRequest(req);
    if (!validation.valid) {
      return validation.response;
    }

    const { adminClient: supabase, userId } = validation;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const path = (formData.get('path') as string | null) ?? null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!path) {
      return NextResponse.json({ error: 'No path provided' }, { status: 400 });
    }

    const { bucket, prefix } = resolveBucketAndPrefix(path);
    if (!ALLOWED_BUCKETS.has(bucket)) {
      return NextResponse.json({ error: `Bucket not allowed: ${bucket}` }, { status: 400 });
    }

    const filename = `${Date.now()}-${sanitizeName(file.name)}`;
    const objectPath = prefix ? `${prefix}/${filename}` : filename;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(objectPath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error('[UPLOAD API] Supabase upload error:', uploadError);
      return NextResponse.json({ error: 'File upload failed', details: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    const url = publicUrlData.publicUrl;
    console.log(`[UPLOAD API] Upload successful. URL: ${url}`);

    return NextResponse.json({ url, bucket, path: objectPath });
  } catch (error: any) {
    console.error('[UPLOAD API] Critical upload error:', error);
    const message = error?.message || 'Unexpected server error';
    return NextResponse.json({ error: 'File upload failed', details: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Validate authenticated user
    const validation = await validateAuthenticatedRequest(req);
    if (!validation.valid) {
      return validation.response;
    }

    const { adminClient: supabase, userId } = validation;

    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: 'No file URL provided' }, { status: 400 });
    }

    // Expecting URLs like: <SUPABASE_URL>/storage/v1/object/public/<bucket>/<objectPath>
    const marker = '/storage/v1/object/';
    const idx = url.indexOf(marker);
    if (idx === -1) {
      // Not a Supabase Storage URL – we cannot delete it here. Consider it deleted for backward compat.
      return NextResponse.json({ message: 'Non-Supabase URL; considered deleted.' });
    }
    const after = url.substring(idx + marker.length);
    // after = "public/<bucket>/<object>" or "sign/<bucket>/<object>"
    const parts = after.split('/');
    if (parts.length < 3) {
      return NextResponse.json({ error: 'Invalid Supabase Storage URL' }, { status: 400 });
    }
    // skip first segment (public|sign)
    const bucket = parts[1];
    const objectPath = parts.slice(2).join('/');

    if (!ALLOWED_BUCKETS.has(bucket)) {
      return NextResponse.json({ error: `Bucket not allowed: ${bucket}` }, { status: 400 });
    }
    const { error } = await supabase.storage.from(bucket).remove([objectPath]);
    if (error) {
      console.error('[UPLOAD API] Delete error:', error);
      return NextResponse.json({ error: 'File deletion failed', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'File deleted successfully' });
  } catch (error: any) {
    console.error('[UPLOAD API] Delete error:', error);
    return NextResponse.json({ error: 'File deletion failed', details: error?.message || 'Unexpected server error' }, { status: 500 });
  }
}
