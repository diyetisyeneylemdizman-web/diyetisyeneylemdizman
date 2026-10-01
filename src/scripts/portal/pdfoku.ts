// PDF'i tarayıcının içinde okur (hiçbir yere yüklenmez) ve vücut analizi raporundaki değerleri çıkarır.
// pdf.js yalnızca bir PDF sürüklendiğinde yüklenir.

import { satirlaraAyir, tanitaCoz, type PdfMetni, type TanitaSonuc } from './tanita';

export async function pdfMetni(dosya: Blob): Promise<PdfMetni> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const isci = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = isci;
  const veri = new Uint8Array(await dosya.arrayBuffer());
  const gorev = pdfjs.getDocument({ data: veri, disableFontFace: true, useSystemFonts: false });
  const doc = await gorev.promise;
  try {
    const sayfalar: PdfMetni = [];
    for (let i = 1; i <= Math.min(doc.numPages, 12); i++) {
      const icerik = await (await doc.getPage(i)).getTextContent();
      const ogeler: { str: string; x: number; y: number }[] = [];
      for (const o of icerik.items) if ('str' in o) ogeler.push({ str: o.str, x: o.transform[4], y: o.transform[5] });
      sayfalar.push(satirlaraAyir(ogeler));
    }
    return sayfalar;
  } finally {
    await gorev.destroy();
  }
}

export async function raporOku(dosya: Blob): Promise<TanitaSonuc | null> {
  return tanitaCoz(await pdfMetni(dosya));
}
