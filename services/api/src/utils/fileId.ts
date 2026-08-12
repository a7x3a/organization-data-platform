// Sequential RAW file ID generator: RAW-000000001, RAW-000000002, ...
// In production this is driven by the database sequence via a counter.
// The scraper worker calls the API to reserve a file_id before uploading.

export function formatFileId(sequence: number): string {
  return `RAW-${String(sequence).padStart(9, '0')}`;
}

// Parses a file_id back to its numeric sequence
export function parseFileId(fileId: string): number {
  const match = fileId.match(/^RAW-(\d+)$/);
  if (!match) throw new Error(`Invalid file_id format: ${fileId}`);
  return parseInt(match[1], 10);
}
