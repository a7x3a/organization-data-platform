import { describe, it, expect } from 'vitest';
import { formatFileId, parseFileId } from './fileId';

describe('formatFileId', () => {
  it('pads the sequence to 9 digits', () => {
    expect(formatFileId(1)).toBe('RAW-000000001');
  });

  it('handles large sequences without truncating', () => {
    expect(formatFileId(123456789)).toBe('RAW-123456789');
  });
});

describe('parseFileId', () => {
  it('round-trips with formatFileId', () => {
    expect(parseFileId(formatFileId(42))).toBe(42);
  });

  it('throws on an invalid format', () => {
    expect(() => parseFileId('not-a-file-id')).toThrow();
  });

  it('throws on a lowercase prefix', () => {
    expect(() => parseFileId('raw-000000001')).toThrow();
  });
});
