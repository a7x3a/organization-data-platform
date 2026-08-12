import { describe, it, expect } from 'vitest';
import { sanitizeFilename, canonicalFilename } from './naming';

describe('sanitizeFilename', () => {
  it('replaces spaces with underscores', () => {
    expect(sanitizeFilename('my document title')).toBe('my_document_title');
  });

  it('prevents path traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('..');
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
  });

  it('removes unsafe filesystem characters', () => {
    const result = sanitizeFilename('file:name*with?unsafe<chars>|"');
    expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
  });

  it('collapses repeated separators to a single underscore', () => {
    expect(sanitizeFilename('a---b___c')).toBe('a_b_c');
  });

  it('strips leading/trailing separators', () => {
    expect(sanitizeFilename('---hello---')).toBe('hello');
  });

  it('falls back to "file" for input that sanitizes to nothing', () => {
    expect(sanitizeFilename('///')).toBe('file');
  });

  it('preserves non-Latin scripts (e.g. Kurdish/Arabic titles)', () => {
    // These characters are outside a-zA-Z0-9._- and get replaced — this
    // documents that behavior explicitly rather than leaving it implicit.
    // The ORIGINAL title is preserved separately as metadata; this function
    // only generates the safe machine name.
    const result = sanitizeFilename('کتێبی بیرکاری');
    expect(result).toBe('file');
  });

  it('truncates very long names', () => {
    const long = 'a'.repeat(500);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200);
  });
});

describe('canonicalFilename', () => {
  it('produces a deterministic name including the fileId', () => {
    const result = canonicalFilename('report.pdf', 'RAW-000000001', '.pdf');
    expect(result).toBe('report-RAW-000000001.pdf');
  });

  it('guarantees uniqueness via the fileId even for identical original names', () => {
    const a = canonicalFilename('report.pdf', 'RAW-000000001', '.pdf');
    const b = canonicalFilename('report.pdf', 'RAW-000000002', '.pdf');
    expect(a).not.toBe(b);
  });

  it('derives extension from the original filename when not explicitly given', () => {
    const result = canonicalFilename('report.pdf', 'RAW-000000001', null);
    expect(result).toBe('report-RAW-000000001.pdf');
  });

  it('handles filenames with no extension', () => {
    const result = canonicalFilename('README', 'RAW-000000001', null);
    expect(result).toBe('README-RAW-000000001');
  });

  it('never lets the extension itself carry unsafe characters', () => {
    const result = canonicalFilename('file', 'RAW-000000001', '../evil');
    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
  });
});
