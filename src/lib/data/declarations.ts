'use client';

import { supabase } from '../supabase/client';
import { uploadReceipt } from '../storage/receipts';

export type DeclarationInput = {
  date: string; // YYYY-MM-DD
  amount: number;
  reason: string;
  file: File;
  is_toll?: boolean;
};

export async function listMyDeclarations() {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('declarations')
    .select('*')
    .eq('user_id', userRes.user.id)
    .order('date', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createDeclaration(input: DeclarationInput) {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw new Error('Not authenticated');
  const userId = userRes.user.id;

  const receiptPath = await uploadReceipt(input.file);

  const { data, error } = await supabase
    .from('declarations')
    .insert({
      user_id: userId,
      date: input.date,
      amount: input.amount,
      reason: input.reason,
      receipt_path: receiptPath,
      is_toll: !!input.is_toll,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

