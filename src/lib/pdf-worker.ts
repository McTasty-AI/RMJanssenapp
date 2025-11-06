// src/lib/pdf-worker.ts

import { pdfjs } from "react-pdf";

// ✅ Gebruik CDN voor compatibiliteit met Next.js/Webpack build proces
// Webpack kan new URL() met import.meta.url niet statisch resolveren tijdens build
// Daarom gebruiken we direct de CDN URL die altijd werkt
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || '3.11.174'}/pdf.worker.min.mjs`;

export { pdfjs };

