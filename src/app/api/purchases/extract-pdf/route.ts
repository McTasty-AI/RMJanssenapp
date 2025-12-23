'use server';

import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side PDF text extraction API
 * This avoids client-side pdfjs-dist import issues with Next.js/Webpack
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // For now, return an error indicating manual entry is needed
    // In production, you could use a server-side PDF library like pdf-parse
    // or call an external OCR service
    return NextResponse.json({ 
      error: 'PDF extraction not yet implemented server-side',
      message: 'Please enter invoice details manually or implement server-side PDF extraction'
    }, { status: 501 });
    
  } catch (error: any) {
    console.error('Error in PDF extraction API:', error);
    return NextResponse.json({ 
      error: 'Failed to process file', 
      details: error.message 
    }, { status: 500 });
  }
}

