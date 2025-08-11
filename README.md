<p align="center">
  <a href="https://www.prokodo.com" target="_blank" rel="noopener noreferrer">
    <img src="https://cdn.prokodo.com/prokodo_logo_1a3bb7867c/prokodo_logo_1a3bb7867c.webp" alt="prokodo – UI component library for React" height="58" />
  </a>
</p>
<h1 align="center">prokodo n8n PDF-Toolkit</h1>
<h2 align="center">Empowering Digital Innovation</h2>

**Merge, split, render and OCR PDFs directly in your n8n workflows — developed by [prokodo](https://www.prokodo.com).**

[![npm](https://img.shields.io/npm/v/@prokodo/n8n-nodes-pdf-toolkit?style=flat&color=3178c6&label=npm)](https://www.npmjs.com/package/@prokodo/n8n-nodes-pdf-toolkit)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## ✨ Features

- ✨ **Merge** multiple PDFs into one
- ✨ **Split a PDF into pages or custom ranges**
- ✨ **PDF → Images (PNG/JPEG) at a chosen DPI**
- ✨ **OCR (Tesseract.js) on PDFs or images**
- 📦 **Auto-detects PDF vs image input**
- 📦 **Per-page or combined text output**
- 📦 **Optional TXT attachment**

## ✅ Requirements
- Node.js 18+ / 20 LTS
- n8n ≥ 1.103 (tested on 1.105+)

Using an older n8n (e.g. 1.88)? It may still work if you align n8n-core / n8n-workflow versions. For best results, upgrade n8n.

## 📦 Install

### Option A — Install into your n8n “custom extensions” folder (recommended)

#### Local n8n (not Docker):

```bash
# choose your custom folder (default ~/.n8n)
export N8N_CUSTOM_EXTENSIONS=~/.n8n

# install the node into that folder
npm install --prefix "$N8N_CUSTOM_EXTENSIONS" n8n-nodes-pdf-tools@latest

# start n8n
n8n start
```

#### Docker (example Dockerfile):

```bash
FROM n8nio/n8n:latest

ENV N8N_CUSTOM_EXTENSIONS=/home/node/.n8n
ENV NODE_PATH=/home/node/.n8n/node_modules

USER node
RUN npm install --prefix /home/node/.n8n n8n-nodes-pdf-tools@latest
```

After starting n8n, search in the node picker for **“prokodo (PDF Toolkit)”**
Internal name: **prokodoPdfToolkit**

## 🛠 Dev install (build + link locally)

```bash
# in this repo
npm ci
npm run build

# make your package linkable
npm link

# link into your n8n custom extensions folder
npm link n8n-nodes-pdf-tools --prefix ~/.n8n

# start n8n with your custom folder
export N8N_CUSTOM_EXTENSIONS=~/.n8n
n8n start
```

Publish-ready tip: This package publishes compiled JS from dist/ to npm.
You don’t need to commit dist/ to Git. To support installs straight from GitHub, add:

```tsx
"scripts": {
  "prepare": "npm run build"
}
```

…and commit src/ (not dist/).

## 🔎 Node usage

### Common
- **Binary Property (Input)**: name of the incoming binary property holding your PDF/image (default data).

### Merge PDFs

**Operation**: Merge PDFs
- **Output Property (Merged PDF)**: binary property for output (default data)
- **Output File Name**: e.g. merged.pdf
- **Result**: a single item with the merged PDF.

### Split PDF

**Operation**: Split PDF
- **Split Mode**: Every Page or By Ranges
- **Ranges (if By Ranges)**: e.g. 1,3-5,10- (1-based, inclusive; 10- means page 10 to end)
- **Output Property**: binary property for each part (default data)
- **Result**: one item per output part.

### PDF → Images

**Operation**: PDF to Images
- **Image Format**: PNG or JPEG
- **DPI**: e.g. 150 (higher → bigger & slower)
- **JPEG Quality**: only when format is JPEG
- **Page Ranges**: e.g. 1-2,5
- **Result**: one item per rendered page, each with binary.image.

### OCR
- **Operation**: OCR
- **Languages (Tesseract)**: e.g. eng, deu, eng+deu
- **Return**: Single (combined text) or Per Page
- **Also Attach TXT as Binary**: optional .txt file output

**Advanced Settings (optional)**:
- OCR Page Ranges (for PDFs only)
- OCR Image Format, OCR DPI, OCR JPEG Quality (rasterization settings)
- Tesseract Lang Path (custom URL/path hosting *.traineddata)
- OCR auto-detects whether the incoming file is a PDF or image via MIME/bytes.

OCR auto-detects whether the incoming file is a PDF or image via MIME/bytes.

## 🧯 Troubleshooting

### Node doesn’t show up

Ensure N8N_CUSTOM_EXTENSIONS points to the folder where you installed the package.
Restart n8n and search for “prokodo (PDF Toolkit)”.
Verify your n8n version (≥ 1.103 recommended).

### “Could not get parameter” during execution

Open the node in the editor and ensure all visible fields for the chosen operation are set.
If you switched operations, re-open and re-save the node.
canvas native dependency errors

#### On Debian/Ubuntu containers:
```bash
apt-get update && apt-get install -y \
  libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*
```

#### On Alpine:
```bash
apk add --no-cache cairo pango jpeg giflib librsvg
```

Prefer Debian-based n8n images for smoother canvas support.

### OCR language data not found / offline
- Set Tesseract Lang Path to a URL/path hosting *.traineddata, e.g. https://tessdata.projectnaptha.com/4.0.0
- Use ocrLang like eng, deu, or eng+deu.

### Slow/High memory on large PDFs
- Lower DPI (e.g. 120).
- Use page ranges (process in chunks).
- Avoid very high DPI for OCR unless necessary.

## 🙌 Contributing

PRs welcome!
```bash
npm ci
npm run build
```

Open a PR with what changed and how to test it.

## 📄 License
This library is published under MIT.

© 2025 prokodo.
Visit us at [prokodo.com](https://www.prokodo.com).