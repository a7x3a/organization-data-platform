// Centralized filename sanitization for anything that reaches disk/R2 with a
// user-influenced name (manual uploads, manual entries). Never trust a
// client-provided filename directly as a storage path component.
//
// The original filename is always preserved separately (CollectedFile.
// originalFilename) — this only generates the safe, deterministic name used
// for the storage key.

const UNSAFE_CHARS = /[^a-zA-Z0-9._-]+/g;
const REPEATED_SEPARATORS = /[_-]{2,}/g;

export function sanitizeFilename(original: string): string {
  const base =
    original
      .normalize('NFKD')
      .replace(/\.\.+/g, '.') // collapse ".." sequences (path traversal)
      .replace(/[/\\]/g, '_') // no path separators
      .trim()
      .replace(/\s+/g, '_')
      .replace(UNSAFE_CHARS, '_')
      .replace(REPEATED_SEPARATORS, '_')
      .replace(/^[._-]+|[._-]+$/g, '') || 'file';

  return base.slice(0, 200); // keep well under filesystem/R2 key limits
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
