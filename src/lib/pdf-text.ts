// Browser-only PDF text extraction via pdf.js loaded from CDN (dynamic import, no bundle cost).
export async function extractPdfText(file: File): Promise<string> {
  const url = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs";
  const pdfjs = await import(/* @vite-ignore */ url);
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push(tc.items.map((i: { str?: string }) => i.str ?? "").join(" "));
  }
  return pages.join("\n\n").slice(0, 20000);
}
