import {
  type INodeType,
  type INodeTypeDescription,
  type INodeExecutionData,
  type IExecuteFunctions,
  NodeOperationError,
} from 'n8n-workflow';

import { PDFDocument } from 'pdf-lib';

// If TS complains about types, see the d.ts shim below
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

// In Node we don't need a separate worker file; turn it off
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = undefined;

import { NODE_DESCRIPTION } from "./PdfTools.const"

// OCR
import Tesseract from 'tesseract.js';

type Range = [number, number]; // inclusive 1-based pages

// Lazy loader so we don't crash at require-time on ABI changes
function loadCanvasOrThrow() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCanvas } = require('canvas');
    return createCanvas as (w: number, h: number) => any;
  } catch (err: any) {
    const message =
      'The native module "canvas" is not available for the current Node runtime. ' +
      'Rebuild your community packages with the running n8n image (or bake into the image).';
    // We throw a plain Error here; wrap as NodeOperationError where we call it
    const e = new Error(message);
    (e as any).cause = err;
    throw e;
  }
}

function parseRanges(spec: string, pageCount: number): Range[] {
  // e.g. "1,3-5,7,10-"
  const out: Range[] = [];
  const parts = spec.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [aRaw, bRaw] = part.split('-').map((x) => x.trim());
      const a = Math.max(1, Number(aRaw || '1'));
      const b = Math.min(pageCount, Number(bRaw || String(pageCount)));
      if (Number.isNaN(a) || Number.isNaN(b) || a > b) {
        throw new Error(`Invalid range "${part}"`);
      }
      out.push([a, b]);
    } else {
      const n = Number(part);
      if (Number.isNaN(n) || n < 1 || n > pageCount) {
        throw new Error(`Invalid page "${part}"`);
      }
      out.push([n, n]);
    }
  }
  return out;
}

class NodeCanvasFactory {
  private createCanvas = loadCanvasOrThrow();
  create(width: number, height: number) {
    const canvas = this.createCanvas(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
    const context = canvas.getContext('2d');
    return { canvas, context };
  }
  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = Math.max(1, Math.floor(width));
    canvasAndContext.canvas.height = Math.max(1, Math.floor(height));
  }
  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

async function renderPdfToImages(
  pdfBytes: Uint8Array,
  opts: { dpi: number; format: 'png' | 'jpeg'; quality?: number; ranges?: Range[] },
 ): Promise<{ buffer: Buffer; fileName: string; page: number }[]> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
  const doc = await loadingTask.promise;
  const pageCount = doc.numPages;

  const scale = Math.max(0.1, opts.dpi / 72);
  const results: { buffer: Buffer; fileName: string; page: number }[] = [];
  const ranges = opts.ranges ?? [[1, pageCount]];

  const factory = new NodeCanvasFactory();

  let globalIndex = 0;
  for (const [start, end] of ranges) {
    for (let p = start; p <= end; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale });
      const { canvas, context } = factory.create(viewport.width, viewport.height);

      const renderContext = {
        canvasContext: context,
        viewport,
        canvasFactory: factory as any,
      };

      await page.render(renderContext as any).promise;

      const fileName = `page-${p}.${opts.format}`;
      const buffer =
        opts.format === 'png'
          ? canvas.toBuffer('image/png')
          : canvas.toBuffer('image/jpeg', { quality: opts.quality ?? 0.9 });

      results.push({ buffer, fileName, page: p });
      factory.destroy({ canvas, context });
      globalIndex++;
    }
  }

  await doc.destroy();
  return results;
}

async function ocrBuffers(
  images: { buffer: Buffer; page: number }[],
  lang: string,
  langPath?: string,
): Promise<{ page: number; text: string }[]> {
  const results: { page: number; text: string }[] = [];
  // Simple sequential OCR to avoid high memory consumption
  for (const img of images) {
    const res = await Tesseract.recognize(img.buffer, lang, {
      ...(langPath ? { langPath } : {}),
      logger: () => {},
    });
    results.push({ page: img.page, text: res.data.text });
  }
  return results;
}

export class PdfTools implements INodeType {
  description: INodeTypeDescription = NODE_DESCRIPTION;

  async execute(this: IExecuteFunctions) {
    const items = this.getInputData();
    const op = this.getNodeParameter('operation', 0) as string;
    const propIn = this.getNodeParameter('binaryPropertyName', 0) as string;

    if (op === 'merge') {
      const outputBinaryProperty = this.getNodeParameter('outputBinaryProperty', 0) as string;
      const outputFileName = this.getNodeParameter('outputFileName', 0) as string;

      const merged = await PDFDocument.create();
      let added = false;

      for (let i = 0; i < items.length; i++) {
        try {
          await this.helpers.assertBinaryData(i, propIn); // nice error if missing
        } catch (e) {
          if (this.continueOnFail()) continue;
          throw e;
        }
        const bytes = await this.helpers.getBinaryDataBuffer(i, propIn);
        const src = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(src, src.getPageIndices());
        for (const p of pages) merged.addPage(p);
        added = true;
      }

      if (!added) {
        if (this.continueOnFail()) return this.prepareOutputData(items);
        throw new NodeOperationError(this.getNode(), 'No PDFs to merge');
      }

      const mergedBytes = await merged.save();
      const binary = await this.helpers.prepareBinaryData(
        Buffer.from(mergedBytes),
        outputFileName,
        'application/pdf',
      );
      const out: INodeExecutionData = { json: {}, binary: { [outputBinaryProperty]: binary } };
      return this.prepareOutputData([out]);
    }

    if (op === 'split') {
      if (items.length !== 1) {
        throw new NodeOperationError(this.getNode(), 'Split expects a single item with one PDF');
      }
      const splitMode = this.getNodeParameter('splitMode', 0) as string;
      const rangesSpec = this.getNodeParameter('ranges', 0, '1-') as string;
      const outProp = this.getNodeParameter('splitOutputProperty', 0) as string;

      const bytes = await this.helpers.getBinaryDataBuffer(0, propIn);

      const src = await PDFDocument.load(bytes);
      const pageCount = src.getPageCount();

      const ranges: Range[] =
        splitMode === 'everyPage'
          ? Array.from({ length: pageCount }, (_, i) => [i + 1, i + 1])
          : parseRanges(rangesSpec, pageCount);

      const outputs: INodeExecutionData[] = [];
      let partIdx = 1;
      for (const [a, b] of ranges) {
        const doc = await PDFDocument.create();
        const pageIndices = Array.from({ length: b - a + 1 }, (_, k) => a - 1 + k);
        const pages = await doc.copyPages(src, pageIndices);
        pages.forEach((p) => doc.addPage(p));
        const outBytes = await doc.save();
        const pdfBinary = await this.helpers.prepareBinaryData(
          Buffer.from(outBytes),
          `split-${partIdx}.pdf`,
          'application/pdf',
        );
        outputs.push({ json: { pages: [a, b] }, binary: { [outProp]: pdfBinary } });
        partIdx++;
      }
      return this.prepareOutputData(outputs);
    }

    if (op === 'toImage') {
      if (items.length !== 1) {
        throw new NodeOperationError(this.getNode(), 'PDF to Images expects a single item (one PDF)');
      }

      const format = this.getNodeParameter('imageFormat', 0) as 'png' | 'jpeg';
      const dpi = this.getNodeParameter('dpi', 0) as number;
      const pageRanges = this.getNodeParameter('pageRanges', 0) as string;

      // Only ask for jpegQuality if imageFormat === 'jpeg'
      const jpegQuality =
        format === 'jpeg' ? (this.getNodeParameter('jpegQuality', 0) as number) : 0.9;

      const bytes = await this.helpers.getBinaryDataBuffer(0, propIn);

      const srcDoc = await PDFDocument.load(bytes);
      const pageCount = srcDoc.getPageCount();
      const ranges = parseRanges(pageRanges, pageCount);

      // Probe canvas early to give a friendly error if not installed
      try {
        loadCanvasOrThrow();
      } catch (err: any) {
        throw new NodeOperationError(this.getNode(), `${err.message}
        Hints:
        • Rebuild community packages with the running n8n image
        • Or bake "canvas" into a custom image built FROM the same n8n version.`);
      }

      const images = await renderPdfToImages(new Uint8Array(bytes), {
        dpi,
        format,
        quality: format === 'jpeg' ? jpegQuality : undefined,
        ranges,
      });

      const outItems: INodeExecutionData[] = await Promise.all(images.map(async (img) => {
        const b = await this.helpers.prepareBinaryData(
          img.buffer,
          img.fileName,
          format === 'png' ? 'image/png' : 'image/jpeg',
        );
        return { json: { page: img.page }, binary: { image: b } };
      }));

      return this.prepareOutputData(outItems);
    }

   if (op === 'ocr') {
    if (items.length !== 1) {
      throw new NodeOperationError(this.getNode(), 'OCR expects a single item (PDF or image)');
    }

    const lang = this.getNodeParameter('ocrLang', 0) as string;
    const ocrReturn = this.getNodeParameter('ocrReturn', 0) as 'single' | 'perPage';
    const attachTxt = this.getNodeParameter('ocrAttachTxt', 0) as boolean;

    // Advanced toggle
    const advanced = this.getNodeParameter('advancedOcr', 0) as boolean;

    const bytes = await this.helpers.getBinaryDataBuffer(0, propIn);

    // Detect PDF vs image
    const isPdf =
      this.getInputData(0)[0]?.binary?.[propIn]?.mimeType?.includes('pdf') ||
      bytes.subarray(0, 5).toString('utf8') === '%PDF-';

    // Defaults for rasterization
    let pageRanges = '1-';
    let format: 'png' | 'jpeg' = 'png';
    let dpi = 150;
    let jpegQuality = 0.9;
    let langPath: string | undefined;

    if (advanced) {
      pageRanges = this.getNodeParameter('ocrPageRanges', 0) as string;
      format = this.getNodeParameter('ocrImageFormat', 0) as 'png' | 'jpeg';
      dpi = this.getNodeParameter('ocrDpi', 0) as number;
      if (format === 'jpeg') {
        jpegQuality = this.getNodeParameter('ocrJpegQuality', 0) as number;
      }
      const lp = (this.getNodeParameter('ocrLangPath', 0) as string) || '';
      langPath = lp || undefined;
    }

    let images: { buffer: Buffer; page: number }[] = [];

    if (isPdf) {
      // Probe canvas early to give a friendly error if not installed
      try {
        loadCanvasOrThrow();
      } catch (err: any) {
        throw new NodeOperationError(this.getNode(), `${err.message}
        Hints:
        • Rebuild community packages with the running n8n image
        • Or bake "canvas" into a custom image built FROM the same n8n version.`);
      }
      const srcDoc = await PDFDocument.load(bytes);
      const pageCount = srcDoc.getPageCount();
      const ranges = parseRanges(pageRanges, pageCount);
      const rendered = await renderPdfToImages(new Uint8Array(bytes), {
        dpi,
        format,
        quality: format === 'jpeg' ? jpegQuality : undefined,
        ranges,
      });
      images = rendered.map((r) => ({ buffer: r.buffer, page: r.page }));
    } else {
      // Treat as image input
      images = [{ buffer: bytes, page: 1 }];
    }

    const texts = await ocrBuffers(images, lang, langPath);

    if (ocrReturn === 'perPage') {
       const outs = texts.map((t) => {
        const out: INodeExecutionData = { json: { page: t.page, text: t.text } };
         if (attachTxt) {
          // attach as proper binary using helper
          // (async map → we'll resolve below for simplicity)
         }
         return out;
       });
      // If attachments requested, prepare binaries
      if (attachTxt) {
        for (const o of outs) {
          const t = (o.json as any).text as string;
          o.binary = {
            text: await this.helpers.prepareBinaryData(Buffer.from(t, 'utf-8'), `page-${(o.json as any).page}.txt`, 'text/plain'),
          };
        }
      }
      return this.prepareOutputData(outs);
     } else {
       const combined = texts
         .sort((a, b) => a.page - b.page)
         .map((t) => `--- Page ${t.page} ---\n${t.text}`)
         .join('\n\n');
      const out: INodeExecutionData = { json: { text: combined } };
       if (attachTxt) {
        out.binary = {
          text: await this.helpers.prepareBinaryData(Buffer.from(combined, 'utf-8'), 'ocr.txt', 'text/plain'),
        };
       }
       return this.prepareOutputData([out]);
     }
  }

    throw new NodeOperationError(this.getNode(), `Unknown operation "${op}"`);
  }
}
