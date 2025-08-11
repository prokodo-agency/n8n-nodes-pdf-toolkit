import type { INodeTypeDescription } from 'n8n-workflow';

export const NODE_DESCRIPTION: INodeTypeDescription = {
  displayName: 'prokodo (PDF Toolkit)',
  name: 'prokodoPdfToolkit',
  group: ['transform'],
  version: 1,
  icon: 'file:prokodo_icon.png',
  iconColor: 'blue',           // (optional) tint used in the UI
  description: 'Merge, split, convert to images, OCR for PDFs',
  defaults: { name: 'PDF Toolkit' },
  inputs: ['main'],
  outputs: ['main'],
  properties: [
    // Operation
    {
      displayName: 'Operation',
      name: 'operation',
      type: 'options',
      options: [
        { name: 'Merge PDFs', value: 'merge' },
        { name: 'Split PDF', value: 'split' },
        { name: 'PDF to Images', value: 'toImage' },
        { name: 'OCR', value: 'ocr' },
      ],
      default: 'merge',
    },

    // Common
    {
      displayName: 'Binary Property (Input)',
      name: 'binaryPropertyName',
      type: 'string',
      default: 'data',
      description: 'Binary property on incoming items with the PDF/image (base64)',
    },

    // Merge
    { displayName: 'Output Property (Merged PDF)', name: 'outputBinaryProperty', type: 'string', default: 'data', displayOptions: { show: { operation: ['merge'] } } },
    { displayName: 'Output File Name', name: 'outputFileName', type: 'string', default: 'merged.pdf', displayOptions: { show: { operation: ['merge'] } } },

    // Split
    { displayName: 'Split Mode', name: 'splitMode', type: 'options', options: [{ name: 'Every Page', value: 'everyPage' }, { name: 'By Ranges', value: 'ranges' }], default: 'everyPage', displayOptions: { show: { operation: ['split'] } } },
    { displayName: 'Ranges', name: 'ranges', type: 'string', default: '1-', description: 'e.g. "1,3-5,10-" (1-based, inclusive)', displayOptions: { show: { operation: ['split'], splitMode: ['ranges'] } } },
    { displayName: 'Output Property', name: 'splitOutputProperty', type: 'string', default: 'data', displayOptions: { show: { operation: ['split'] } } },

    // toImage (kept as-is)
    {
      displayName: 'Image Format',
      name: 'imageFormat',
      type: 'options',
      options: [{ name: 'PNG', value: 'png' }, { name: 'JPEG', value: 'jpeg' }],
      default: 'png',
      displayOptions: { show: { operation: ['toImage'] } },
    },
    {
      displayName: 'DPI',
      name: 'dpi',
      type: 'number',
      typeOptions: { minValue: 36, maxValue: 600, numberStepSize: 1 },
      default: 150,
      description: 'Render resolution when rasterizing PDF pages',
      displayOptions: { show: { operation: ['toImage'] } },
    },
    {
      displayName: 'JPEG Quality',
      name: 'jpegQuality',
      type: 'number',
      typeOptions: { minValue: 0.1, maxValue: 1, numberStepSize: 0.05 },
      default: 0.9,
      displayOptions: { show: { operation: ['toImage'], imageFormat: ['jpeg'] } },
    },
    {
      displayName: 'Page Ranges',
      name: 'pageRanges',
      type: 'string',
      default: '1-',
      description: 'e.g. "1,2-4" (1-based) — for toImage on PDFs',
      displayOptions: { show: { operation: ['toImage'] } },
    },

    // OCR (simplified + advanced block)
    // Removed ocrInputType (auto-detect)
    { displayName: 'Languages (Tesseract)', name: 'ocrLang', type: 'string', default: 'eng', description: 'Like "eng" or "eng+deu"', displayOptions: { show: { operation: ['ocr'] } } },
    { displayName: 'Return', name: 'ocrReturn', type: 'options', options: [{ name: 'Single Item (combined text)', value: 'single' }, { name: 'One Item per Page/Image', value: 'perPage' }], default: 'single', displayOptions: { show: { operation: ['ocr'] } } },
    { displayName: 'Also Attach TXT as Binary', name: 'ocrAttachTxt', type: 'boolean', default: false, displayOptions: { show: { operation: ['ocr'] } } },

    // Advanced toggle
    { displayName: 'Advanced Settings', name: 'advancedOcr', type: 'boolean', default: false, displayOptions: { show: { operation: ['ocr'] } } },

    // OCR-specific advanced params (different names to avoid OR logic)
    {
      displayName: 'OCR Page Ranges',
      name: 'ocrPageRanges',
      type: 'string',
      default: '1-',
      description: 'e.g. "1,2-4" (1-based) — only for PDFs',
      displayOptions: { show: { operation: ['ocr'], advancedOcr: [true] } },
    },
    {
      displayName: 'OCR Image Format',
      name: 'ocrImageFormat',
      type: 'options',
      options: [{ name: 'PNG', value: 'png' }, { name: 'JPEG', value: 'jpeg' }],
      default: 'png',
      displayOptions: { show: { operation: ['ocr'], advancedOcr: [true] } },
    },
    {
      displayName: 'OCR DPI',
      name: 'ocrDpi',
      type: 'number',
      typeOptions: { minValue: 36, maxValue: 600, numberStepSize: 1 },
      default: 150,
      displayOptions: { show: { operation: ['ocr'], advancedOcr: [true] } },
    },
    {
      displayName: 'OCR JPEG Quality',
      name: 'ocrJpegQuality',
      type: 'number',
      typeOptions: { minValue: 0.1, maxValue: 1, numberStepSize: 0.05 },
      default: 0.9,
      displayOptions: { show: { operation: ['ocr'], advancedOcr: [true], ocrImageFormat: ['jpeg'] } },
    },
    {
      displayName: 'Tesseract Lang Path (Optional)',
      name: 'ocrLangPath',
      type: 'string',
      default: '',
      description: 'Custom URL/path hosting traineddata files (optional)',
      displayOptions: { show: { operation: ['ocr'], advancedOcr: [true] } },
    },
  ],
};
