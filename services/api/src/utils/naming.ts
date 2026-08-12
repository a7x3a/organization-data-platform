// Centralized filename sanitization for anything that reaches disk/R2 with a
// user-influenced name (manual uploads, manual entries). Never trust a
// client-provided filename directly as a storage path component.
//
// The original filename is always preserved separately (CollectedFile.
// originalFilename) — this only generates the safe, deterministic name used
// for the storage key.

// Only genuinely filesystem-unsafe characters — path separators, Windows-
// reserved characters, control characters. Everything else, including
// non-Latin scripts (Kurdish, Arabic, ...), is preserved: this used to
// strip anything outside [a-zA-Z0-9._-], which silently reduced every
// non-ASCII filename (e.g. a Kurdish document title) to underscores.
const UNSAFE_CHARS = /[\\/:*?"<>|\x00-\x1f]+/g;
const REPEATED_SEPARATORS = /[_-]{2,}/g;

export function sanitizeFilename(original: string): string {
  const base =
    original
      .replace(/\.\.+/g, '.') // collapse ".." sequences (path traversal)
      .trim()
      .replace(/\s+/g, '_')
      .replace(UNSAFE_CHARS, '_')
      .replace(REPEATED_SEPARATORS, '_')
      .replace(/^[._-]+|[._-]+$/g, '') || 'file';

  return base.slice(0, 200); // keep well under filesystem/R2 key limits
}

// Storage-folder category per file type — mirrors categorize_file() in the
// scraper (services/scraper/app/downloader/downloader.py). Keeps 00_raw
// from becoming one giant "files" bucket mixing PDFs, audio, video, etc.,
// for manual uploads the same way the scraper's own pipeline already does.
const CATEGORY_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'pdf',
  '.doc': 'documents', '.docx': 'documents', '.odt': 'documents', '.rtf': 'documents',
  '.xls': 'spreadsheets', '.xlsx': 'spreadsheets', '.ods': 'spreadsheets', '.csv': 'spreadsheets',
  '.ppt': 'presentations', '.pptx': 'presentations', '.odp': 'presentations',
  '.zip': 'archives', '.rar': 'archives', '.7z': 'archives', '.tar': 'archives', '.gz': 'archives',
  '.txt': 'text', '.md': 'text',
};

export function categorizeFile(mimeType: string | null | undefined, extension: string | null | undefined): string {
  if (mimeType) {
    if (mimeType === 'application/pdf') return 'pdf';
    const primary = mimeType.split('/')[0];
    if (primary === 'audio') return 'audio';
    if (primary === 'video') return 'video';
    if (primary === 'image') return 'images';
    if (primary === 'text') return 'text';
  }

  if (extension) {
    const category = CATEGORY_BY_EXTENSION[extension.toLowerCase()];
    if (category) return category;
  }

  return 'other';
}

// Deterministic canonical name: {sanitized-base}-{fileId}{ext}
// Guarantees uniqueness (fileId is always unique) without needing a
// collision-detection pass.
export function canonicalFilename(originalFilename: string, fileId: string, extension?: string | null): string {
  const dot = originalFilename.lastIndexOf('.');
  const base = dot > 0 ? originalFilename.slice(0, dot) : originalFilename;
  const ext = extension || (dot > 0 ? originalFilename.slice(dot) : '');
  const safeBase = sanitizeFilename(base);
  const safeExt = ext
    ? `.${ext.replace(/\.\.+/g, '.').replace(/^\./, '').replace(UNSAFE_CHARS, '')}`
    : '';
  return `${safeBase}-${fileId}${safeExt}`;
}
