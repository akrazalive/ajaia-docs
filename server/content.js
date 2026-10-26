// Document content handling: HTML sanitising and file-to-HTML import.
// Documents are stored as HTML restricted to the formatting the editor supports,
// so anything that enters the database (editor saves or file imports) passes through here.
import path from 'node:path';
import sanitizeHtml from 'sanitize-html';
import mammoth from 'mammoth';
import { marked } from 'marked';

export const MAX_CONTENT_BYTES = 1_000_000;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'];

const SANITIZE_OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote', 'hr',
    'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'], ol: ['start'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Normalise equivalent tags coming from imports so the editor schema recognises them.
  transformTags: {
    b: 'strong', i: 'em', strike: 's', del: 's', ins: 'u',
    h4: 'h3', h5: 'h3', h6: 'h3',
    div: 'p',
  },
};

export function sanitizeContent(html) {
  return sanitizeHtml(String(html ?? ''), SANITIZE_OPTIONS).trim();
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function textToHtml(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export class ImportError extends Error {}

/**
 * Convert an uploaded file into sanitised editor HTML.
 * @returns {Promise<{ title: string, html: string }>}
 */
export async function convertFile({ originalname, buffer }) {
  const ext = path.extname(originalname || '').toLowerCase();
  const title = path.basename(originalname || 'Imported document', ext).trim().slice(0, 200) || 'Imported document';

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new ImportError(`Unsupported file type "${ext || 'unknown'}". Supported: .txt, .md, .docx`);
  }
  if (!buffer?.length) throw new ImportError('The uploaded file is empty.');

  let html;
  if (ext === '.docx') {
    // .docx is a zip archive; check the magic bytes before handing it to mammoth.
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new ImportError('This file is not a valid .docx document.');
    try {
      html = (await mammoth.convertToHtml({ buffer })).value;
    } catch {
      throw new ImportError('Could not read this .docx file. Is it corrupted or password-protected?');
    }
  } else {
    const text = buffer.toString('utf8');
    if (text.includes('\u0000')) throw new ImportError('This file appears to be binary, not text.');
    html = ext === '.txt' ? textToHtml(text) : await marked.parse(text, { gfm: true });
  }

  const clean = sanitizeContent(html);
  if (!clean) throw new ImportError('No readable content was found in this file.');
  return { title, html: clean };
}
