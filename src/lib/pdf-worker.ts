// src/lib/pdf-worker.ts

import { pdfjs } from "react-pdf";

// ✅ correcte en portable ESM-methode
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export { pdfjs };

