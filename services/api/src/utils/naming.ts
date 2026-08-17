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
  '.doc': 'documents', '.docx': 'documents', '.odt': 'documents', '.rtf': 'documents', '.pages': 'documents',
  '.xls': 'spreadsheets', '.xlsx': 'spreadsheets', '.ods': 'spreadsheets', '.csv': 'spreadsheets', '.tsv': 'spreadsheets',
  '.ppt': 'presentations', '.pptx': 'presentations', '.odp': 'presentations',
  '.zip': 'archives', '.rar': 'archives', '.7z': 'archives', '.tar': 'archives', '.gz': 'archives', '.bz2': 'archives', '.xz': 'archives', '.iso': 'archives',
  '.txt': 'text', '.md': 'text', '.rst': 'text',
  '.epub': 'ebooks', '.mobi': 'ebooks', '.azw3': 'ebooks', '.fb2': 'ebooks', '.djvu': 'ebooks', '.cbz': 'ebooks', '.cbr': 'ebooks', '.chm': 'ebooks',
  '.mp3': 'audio', '.m4a': 'audio', '.wav': 'audio', '.flac': 'audio', '.ogg': 'audio', '.opus': 'audio', '.aac': 'audio', '.wma': 'audio',
  '.mp4': 'video', '.mkv': 'video', '.avi': 'video', '.mov': 'video', '.webm': 'video', '.flv': 'video', '.wmv': 'video', '.m4v': 'video',
  '.jpg': 'images', '.jpeg': 'images', '.png': 'images', '.gif': 'images', '.webp': 'images', '.svg': 'images', '.bmp': 'images', '.ico': 'images',
  '.srt': 'subtitles', '.vtt': 'subtitles',
  '.json': 'data', '.jsonl': 'data', '.xml': 'data', '.parquet': 'data', '.arrow': 'data', '.feather': 'data',
  '.py': 'code', '.js': 'code', '.ts': 'code', '.html': 'code', '.css': 'code', '.sql': 'code', '.yaml': 'code', '.yml': 'code',
};

export function categorizeFile(mimeType: string | null | undefined, extension: string | null | undefined): string {
  let cleanExt = '';
  if (extension) {
    cleanExt = extension.split('?')[0].split('#')[0].trim().toLowerCase();
    if (cleanExt && !cleanExt.startsWith('.')) {
      cleanExt = `.${cleanExt}`;
    }
  }

  if (cleanExt === '.pdf' || mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (mimeType) {
    const mimeLower = mimeType.toLowerCase();
    if (mimeLower.startsWith('audio/')) return 'audio';
    if (mimeLower.startsWith('video/')) return 'video';
    if (mimeLower.startsWith('image/')) return 'images';
    if (mimeLower.startsWith('text/')) return 'text';
    if (mimeLower.includes('zip') || mimeLower.includes('rar') || mimeLower.includes('compressed')) return 'archives';
  }

  if (cleanExt) {
    const category = CATEGORY_BY_EXTENSION[cleanExt];
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
