'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';

/**
 * OCR-based invoice extraction
 * Extracts invoice data from PDF using text extraction and pattern matching
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // For now, we'll extract text from PDF using a client-side approach
    // In production, you might want to use a Python Edge Function for better OCR
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    // Return the file data - actual OCR extraction will happen client-side
    // or via a Python Edge Function
    return NextResponse.json({ 
      fileData: `data:${file.type};base64,${base64}`,
      fileName: file.name,
      fileType: file.type
    });
  } catch (error: any) {
    console.error('Error in OCR extraction:', error);
    return NextResponse.json({ error: 'Failed to process file', details: error.message }, { status: 500 });
  }
}

