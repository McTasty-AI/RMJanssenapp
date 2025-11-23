
"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
    // Configure worker FIRST before any other imports
    // Import pdfjs-dist directly to set worker source early
    const pdfjsDist = await import('pdfjs-dist');
    if (pdfjsDist && pdfjsDist.GlobalWorkerOptions) {
      const version = pdfjsDist.version || '3.11.174';
      // Try multiple CDN options for reliability
      // Use unpkg as primary (more reliable than cdnjs)
      const workerUrl = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
      pdfjsDist.GlobalWorkerOptions.workerSrc = workerUrl;
      console.log('PDF.js worker configured:', workerUrl);
    }
    
    // Load CSS dynamically
    await Promise.all([
      import('react-pdf/dist/esm/Page/AnnotationLayer.css'),
      import('react-pdf/dist/esm/Page/TextLayer.css')
    ]);
    
    // Load react-pdf module
    const reactPdfModule = await import('react-pdf');
    Document = reactPdfModule.Document;
    Page = reactPdfModule.Page;
    
    // Also configure via react-pdf's pdfjs instance if available
    const pdfjs = reactPdfModule.pdfjs || (reactPdfModule as any).default?.pdfjs;
    if (pdfjs && pdfjs.GlobalWorkerOptions) {
      const version = pdfjs.version || pdfjsDist?.version || '3.11.174';
      const workerUrl = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
    
    reactPdfLoaded = true;
    console.log('react-pdf loaded successfully');
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
  
  // Suppress ONLY worker-related console warnings (not all pdf.js warnings)
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    
    // Only filter out worker loading warnings, not PDF loading errors
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      // Only suppress if it's specifically about worker loading, not PDF loading
      if ((message.includes('worker') && message.includes('Cannot load script')) ||
          (message.includes('Setting up fake worker'))) {
        // Worker warnings are non-critical - suppress them
        return;
      }
      // Allow all other errors through for debugging
      originalError.apply(console, args);
    };
    
    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      // Only suppress worker-specific warnings
      if ((message.includes('worker') && message.includes('Cannot load script')) ||
          (message.includes('Setting up fake worker'))) {
        // Worker warnings are non-critical - suppress them
        return;
      }
      // Allow all other warnings through for debugging
      originalWarn.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);
  
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
    console.log('PDF loaded successfully, pages:', numPages);
    setNumPages(numPages);
  }

  function onDocumentLoadError(error: Error): void {
    const errorMessage = error?.message || String(error || '');
    
    // Log all errors for debugging
    console.error('PDF Document Load Error:', error);
    console.error('Error message:', errorMessage);
    
    // Worker warnings are non-critical - PDF can still render with fake worker
    // But we still want to see if there are other real errors
    if (errorMessage.includes('worker') || 
        errorMessage.includes('Setting up fake worker') ||
        errorMessage.includes('Cannot load script')) {
      // Worker warnings are non-critical - PDF.js will use a fake worker
      console.warn('PDF worker warning (non-critical):', errorMessage);
      // Don't show toast for worker warnings - PDF should still load
      return;
    }
    
    // Show toast only for real PDF loading errors
    toast({
      variant: 'destructive',
      title: 'PDF kon niet worden geladen',
      description: `Er is een fout opgetreden bij het laden van de PDF. Controleer de console voor details.`,
    });
  }

  const goToPrevPage = () => setPageNumber(prev => Math.max(prev - 1, 1));
  const goToNextPage = () => setPageNumber(prev => Math.min(prev + 1, numPages!));
  
  if (!file) {
    return <Skeleton className="h-64 w-full" />;
  }

  // Log file info for debugging and create object URL if needed
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  
  useEffect(() => {
    if (!file) {
      setFileUrl(null);
      return;
    }
    
    // Log file info
    console.log('PDF Preview - File info:', {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      isFile: file instanceof File,
      isBlob: file instanceof Blob
    });
    
    // Create object URL from File/Blob for react-pdf
    // react-pdf works better with object URLs than File objects directly
    if (file instanceof File || file instanceof Blob) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      console.log('Created object URL for PDF:', url);
      
      // Cleanup URL when file changes or component unmounts
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      console.error('Invalid file object:', file);
      setFileUrl(null);
    }
  }, [file]);
  
  // Memoize options to prevent unnecessary reloads
  const documentOptions = useMemo(() => ({
    cMapUrl: undefined,
    cMapPacked: false,
    standardFontDataUrl: undefined,
    verbosity: 0, // Reduce console output
  }), []);

  // Show loading state until react-pdf is loaded
  if (!isPdfLoaded || !Document || !Page) {
    return <Skeleton className="h-64 w-full" />;
  }

  // Use object URL if available, otherwise fallback to file directly
  // react-pdf works better with URLs than File objects
  const fileToLoad = fileUrl || (file instanceof File ? file : null);

  if (!file || !fileToLoad) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <p className="text-sm text-muted-foreground mb-2">No PDF file provided.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col items-center">
      <Document
        file={fileToLoad}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={<Skeleton className="h-full w-full" />}
        error={
          <div className="flex flex-col items-center justify-center h-full p-4">
            <p className="text-sm text-muted-foreground mb-2">Failed to load PDF file.</p>
            <p className="text-xs text-muted-foreground">Check console for details.</p>
          </div>
        }
        className="flex justify-center"
        options={documentOptions}
      >
        <Page 
          pageNumber={pageNumber} 
          renderTextLayer={false}
          renderAnnotationLayer={true}
          width={containerWidth > 0 ? containerWidth - 20 : undefined}
          onLoadError={(error) => {
            console.error('PDF Page Load Error:', error);
            onDocumentLoadError(error);
          }}
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
