'use client';

import { supabase } from '../supabase/client';

function sanitizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Upload a receipt file to the `receipts` bucket under the signed-in user's folder.
 * Returns the storage object path to store in `declarations.receipt_path`.
 */
export async function uploadReceipt(file: File): Promise<string> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw new Error('Not authenticated');

  const userId = userRes.user.id;
  const objectPath = `${userId}/${Date.now()}-${sanitizeName(file.name)}`;

  const { error } = await supabase.storage
    .from('receipts')
    .upload(objectPath, file, { contentType: file.type, upsert: false });

  if (error) throw error;
  return objectPath;
}

