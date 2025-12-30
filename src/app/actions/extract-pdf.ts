'use server';

import { PDFParse } from 'pdf-parse';

export async function extractPdfTextAction(formData: FormData): Promise<string> {
  const file = formData.get('file') as File;

  if (!file) {
    throw new Error('No file provided');
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    // Use Uint8Array as recommended by LoadParameters
    const uint8Array = new Uint8Array(arrayBuffer);

    // Initialize parser with data
    const parser = new PDFParse({ data: uint8Array });

    // Extract text
    const textResult = await parser.getText();
    return textResult.text;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}
