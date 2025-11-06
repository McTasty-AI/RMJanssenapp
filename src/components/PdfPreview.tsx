
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Dynamically import react-pdf to avoid Turbopack bundling issues
let Document: any = null;
let Page: any = null;
let reactPdfLoaded = false;

const loadReactPdf = async () => {
  if (reactPdfLoaded) return;
  
  try {
    // Load CSS dynamically
    await Promise.all([
      import('react-pdf/dist/esm/Page/AnnotationLayer.css'),
      import('react-pdf/dist/esm/Page/TextLayer.css')
    ]);
    
    // Load react-pdf module
    const reactPdfModule = await import('react-pdf');
    Document = reactPdfModule.Document;
    Page = reactPdfModule.Page;
    
    // Configure worker using CDN (required for Next.js/Webpack compatibility)
    const pdfjs = reactPdfModule.pdfjs || (reactPdfModule as any).default?.pdfjs;
    if (pdfjs) {
      // Use CDN worker URL - Next.js/Webpack doesn't support new URL() with import.meta.url for ESM packages
      // Updated for pdfjs-dist 3.11.174
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || '3.11.174'}/pdf.worker.min.mjs`;
    }
    
    reactPdfLoaded = true;
  } catch (error) {
    console.error('Failed to load react-pdf:', error);
  }
};

interface PdfPreviewProps {
  file: File | null;
}

export default function PdfPreview({ file }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isPdfLoaded, setIsPdfLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Load react-pdf dynamically when component mounts
  useEffect(() => {
    loadReactPdf().then(() => {
      setIsPdfLoaded(true);
    });
  }, []);
  
  useEffect(() => {
    const handleResize = () => {
        if(containerRef.current) {
            setContainerWidth(containerRef.current.clientWidth);
        }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
  }

  function onDocumentLoadError(error: Error): void {
    console.error('Error while loading document:', error);
    toast({
      variant: 'destructive',
      title: 'PDF kon niet worden geladen',
      description: `Er is een fout opgetreden: ${error.message}`,
    });
  }

  const goToPrevPage = () => setPageNumber(prev => Math.max(prev - 1, 1));
  const goToNextPage = () => setPageNumber(prev => Math.min(prev + 1, numPages!));
  
  if (!file) {
    return <Skeleton className="h-64 w-full" />;
  }

  // Show loading state until react-pdf is loaded
  if (!isPdfLoaded || !Document || !Page) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col items-center">
      <Document
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={<Skeleton className="h-full w-full" />}
        className="flex justify-center"
      >
        <Page 
          pageNumber={pageNumber} 
          renderTextLayer={false} 
          width={containerWidth > 0 ? containerWidth - 20 : undefined}
        />
      </Document>
      {numPages && numPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-2">
            <Button variant="outline" size="icon" onClick={goToPrevPage} disabled={pageNumber <= 1}>
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm text-muted-foreground">
                Pagina {pageNumber} van {numPages}
            </p>
             <Button variant="outline" size="icon" onClick={goToNextPage} disabled={pageNumber >= numPages}>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
      )}
    </div>
  );
}
