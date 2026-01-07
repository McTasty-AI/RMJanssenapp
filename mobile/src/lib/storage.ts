import { supabase } from './supabase';

function sanitizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Upload a local file (uri) to Supabase Storage.
 * Returns the object path to store in your table.
 */
export async function uploadFromUri(params: {
  bucket: string;
  uri: string;
  userId: string;
  originalName?: string;
}) {
  const { bucket, uri, userId, originalName } = params;
  const name = originalName ? sanitizeName(originalName) : 'upload';
  const filePath = `${userId}/${Date.now()}-${name}`;

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage.from(bucket).upload(filePath, blob, {
    upsert: false,
    contentType: (blob as any)?.type ?? 'application/octet-stream',
  });

  if (error) throw error;
  return filePath;
}






