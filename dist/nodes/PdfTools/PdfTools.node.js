"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfTools = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const pdf_lib_1 = require("pdf-lib");
// If TS complains about types, see the d.ts shim below
const pdfjsLib = __importStar(require("pdfjs-dist/legacy/build/pdf.js"));
// Worker (not strictly used server-side, but set to quiet warnings)
require("pdfjs-dist/legacy/build/pdf.worker.js");
const PdfTools_const_1 = require("./PdfTools.const");
// node-canvas for rendering in Node
const canvas_1 = require("canvas");
// OCR
const tesseract_js_1 = __importDefault(require("tesseract.js"));
function parseRanges(spec, pageCount) {
    // e.g. "1,3-5,7,10-"
    const out = [];
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
        }
        else {
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
    create(width, height) {
        const canvas = (0, canvas_1.createCanvas)(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        const context = canvas.getContext('2d');
        return { canvas, context };
    }
    reset(canvasAndContext, width, height) {
        canvasAndContext.canvas.width = Math.max(1, Math.floor(width));
        canvasAndContext.canvas.height = Math.max(1, Math.floor(height));
    }
    destroy(canvasAndContext) {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
    }
}
async function renderPdfToImages(pdfBytes, opts) {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const doc = await loadingTask.promise;
    const pageCount = doc.numPages;
    const scale = Math.max(0.1, opts.dpi / 72);
    const results = [];
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
                canvasFactory: factory,
            };
            await page.render(renderContext).promise;
            const fileName = `page-${p}.${opts.format}`;
            const buffer = opts.format === 'png'
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
async function ocrBuffers(images, lang, langPath) {
    const results = [];
    // Simple sequential OCR to avoid high memory consumption
    for (const img of images) {
        const res = await tesseract_js_1.default.recognize(img.buffer, lang, {
            ...(langPath ? { langPath } : {}),
            logger: () => { },
        });
        results.push({ page: img.page, text: res.data.text });
    }
    return results;
}
class PdfTools {
    constructor() {
        this.description = PdfTools_const_1.NODE_DESCRIPTION;
    }
    async execute() {
        const items = this.getInputData();
        const op = this.getNodeParameter('operation', 0);
        const propIn = this.getNodeParameter('binaryPropertyName', 0);
        if (op === 'merge') {
            const outputBinaryProperty = this.getNodeParameter('outputBinaryProperty', 0);
            const outputFileName = this.getNodeParameter('outputFileName', 0);
            const merged = await pdf_lib_1.PDFDocument.create();
            let added = false;
            for (let i = 0; i < items.length; i++) {
                const bin = items[i].binary?.[propIn];
                if (!bin?.data) {
                    if (this.continueOnFail())
                        continue;
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Item ${i} missing binary "${propIn}"`);
                }
                const bytes = Buffer.from(bin.data, 'base64');
                const src = await pdf_lib_1.PDFDocument.load(bytes);
                const pages = await merged.copyPages(src, src.getPageIndices());
                for (const p of pages)
                    merged.addPage(p);
                added = true;
            }
            if (!added) {
                if (this.continueOnFail())
                    return this.prepareOutputData(items);
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'No PDFs to merge');
            }
            const mergedBytes = await merged.save();
            const out = {
                json: {},
                binary: {
                    [outputBinaryProperty]: {
                        data: Buffer.from(mergedBytes).toString('base64'),
                        mimeType: 'application/pdf',
                        fileName: outputFileName,
                    },
                },
            };
            return this.prepareOutputData([out]);
        }
        if (op === 'split') {
            if (items.length !== 1) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Split expects a single item with one PDF');
            }
            const splitMode = this.getNodeParameter('splitMode', 0);
            const rangesSpec = this.getNodeParameter('ranges', 0, '1-');
            const outProp = this.getNodeParameter('splitOutputProperty', 0);
            const bin = items[0].binary?.[propIn];
            if (!bin?.data)
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Missing binary "${propIn}"`);
            const bytes = Buffer.from(bin.data, 'base64');
            const src = await pdf_lib_1.PDFDocument.load(bytes);
            const pageCount = src.getPageCount();
            const ranges = splitMode === 'everyPage'
                ? Array.from({ length: pageCount }, (_, i) => [i + 1, i + 1])
                : parseRanges(rangesSpec, pageCount);
            const outputs = [];
            let partIdx = 1;
            for (const [a, b] of ranges) {
                const doc = await pdf_lib_1.PDFDocument.create();
                const pageIndices = Array.from({ length: b - a + 1 }, (_, k) => a - 1 + k);
                const pages = await doc.copyPages(src, pageIndices);
                pages.forEach((p) => doc.addPage(p));
                const outBytes = await doc.save();
                outputs.push({
                    json: { pages: [a, b] },
                    binary: {
                        [outProp]: {
                            data: Buffer.from(outBytes).toString('base64'),
                            mimeType: 'application/pdf',
                            fileName: `split-${partIdx}.pdf`,
                        },
                    },
                });
                partIdx++;
            }
            return this.prepareOutputData(outputs);
        }
        if (op === 'toImage') {
            if (items.length !== 1) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'PDF to Images expects a single item (one PDF)');
            }
            const format = this.getNodeParameter('imageFormat', 0);
            const dpi = this.getNodeParameter('dpi', 0);
            const pageRanges = this.getNodeParameter('pageRanges', 0);
            // Only ask for jpegQuality if imageFormat === 'jpeg'
            const jpegQuality = format === 'jpeg' ? this.getNodeParameter('jpegQuality', 0) : 0.9;
            const bin = items[0].binary?.[propIn];
            if (!bin?.data)
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Missing binary "${propIn}"`);
            const bytes = Buffer.from(bin.data, 'base64');
            const srcDoc = await pdf_lib_1.PDFDocument.load(bytes);
            const pageCount = srcDoc.getPageCount();
            const ranges = parseRanges(pageRanges, pageCount);
            const images = await renderPdfToImages(new Uint8Array(bytes), {
                dpi,
                format,
                quality: format === 'jpeg' ? jpegQuality : undefined,
                ranges,
            });
            const outItems = images.map((img) => ({
                json: { page: img.page },
                binary: {
                    image: {
                        data: img.buffer.toString('base64'),
                        mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
                        fileName: img.fileName,
                    },
                },
            }));
            return this.prepareOutputData(outItems);
        }
        if (op === 'ocr') {
            if (items.length !== 1) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'OCR expects a single item (PDF or image)');
            }
            const lang = this.getNodeParameter('ocrLang', 0);
            const ocrReturn = this.getNodeParameter('ocrReturn', 0);
            const attachTxt = this.getNodeParameter('ocrAttachTxt', 0);
            // Advanced toggle
            const advanced = this.getNodeParameter('advancedOcr', 0);
            const bin = items[0].binary?.[propIn];
            if (!bin?.data)
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Missing binary "${propIn}"`);
            const bytes = Buffer.from(bin.data, 'base64');
            // Detect PDF vs image
            const isPdf = (bin.mimeType && bin.mimeType.includes('pdf')) ||
                bytes.slice(0, 5).toString('utf8') === '%PDF-';
            // Defaults for rasterization
            let pageRanges = '1-';
            let format = 'png';
            let dpi = 150;
            let jpegQuality = 0.9;
            let langPath;
            if (advanced) {
                pageRanges = this.getNodeParameter('ocrPageRanges', 0);
                format = this.getNodeParameter('ocrImageFormat', 0);
                dpi = this.getNodeParameter('ocrDpi', 0);
                if (format === 'jpeg') {
                    jpegQuality = this.getNodeParameter('ocrJpegQuality', 0);
                }
                const lp = this.getNodeParameter('ocrLangPath', 0) || '';
                langPath = lp || undefined;
            }
            let images = [];
            if (isPdf) {
                const srcDoc = await pdf_lib_1.PDFDocument.load(bytes);
                const pageCount = srcDoc.getPageCount();
                const ranges = parseRanges(pageRanges, pageCount);
                const rendered = await renderPdfToImages(new Uint8Array(bytes), {
                    dpi,
                    format,
                    quality: format === 'jpeg' ? jpegQuality : undefined,
                    ranges,
                });
                images = rendered.map((r) => ({ buffer: r.buffer, page: r.page }));
            }
            else {
                // Treat as image input
                images = [{ buffer: Buffer.from(bytes), page: 1 }];
            }
            const texts = await ocrBuffers(images, lang, langPath);
            if (ocrReturn === 'perPage') {
                const outs = texts.map((t) => {
                    const out = { json: { page: t.page, text: t.text } };
                    if (attachTxt) {
                        out.binary = {
                            text: {
                                data: Buffer.from(t.text, 'utf-8').toString('base64'),
                                mimeType: 'text/plain',
                                fileName: `page-${t.page}.txt`,
                            },
                        };
                    }
                    return out;
                });
                return this.prepareOutputData(outs);
            }
            else {
                const combined = texts
                    .sort((a, b) => a.page - b.page)
                    .map((t) => `--- Page ${t.page} ---\n${t.text}`)
                    .join('\n\n');
                const out = { json: { text: combined } };
                if (attachTxt) {
                    out.binary = {
                        text: {
                            data: Buffer.from(combined, 'utf-8').toString('base64'),
                            mimeType: 'text/plain',
                            fileName: 'ocr.txt',
                        },
                    };
                }
                return this.prepareOutputData([out]);
            }
        }
        throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Unknown operation "${op}"`);
    }
}
exports.PdfTools = PdfTools;
