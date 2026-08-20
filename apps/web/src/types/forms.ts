// Form input types for the frontend (derived from shared-types but UI-friendly)
import type { CollectorConfiguration } from '@odp/shared-types';

export type CollectorTypeInput = 'WEB' | 'TELEGRAM' | 'MEDIA';

export interface CreateSourceInput {
  name: string;
  slug: string;
  baseUrl: string;
  description?: string | null;
  enabled: boolean;
  robotsPolicy: 'RESPECT' | 'IGNORE';
}

export type UpdateSourceInput = Partial<CreateSourceInput>;

export interface CreateCollectorInput {
  sourceId: string;
  name: string;
  type: CollectorTypeInput;
  version?: string;
  enabled: boolean;
  schedule?: string | null;
  configuration: CollectorConfiguration;
}

export type UpdateCollectorInput = Partial<Omit<CreateCollectorInput, 'sourceId'>>;

export interface FileTypeGroup {
  id: string;
  name: string;
  extensions: string[];
  description: string;
}

export const STANDARDIZED_FILE_GROUPS: FileTypeGroup[] = [
  { id: 'pdf', name: 'PDF Documents', extensions: ['.pdf'], description: 'Books, reports, official scans' },
  { id: 'documents', name: 'Office Documents', extensions: ['.doc', '.docx', '.odt', '.rtf', '.pages'], description: 'Word documents & text formats' },
  { id: 'ebooks', name: 'E-Books & Publications', extensions: ['.epub', '.mobi', '.azw3', '.fb2', '.djvu'], description: 'Digital books & publications' },
  { id: 'spreadsheets', name: 'Spreadsheets & Tables', extensions: ['.xlsx', '.xls', '.csv', '.tsv', '.ods'], description: 'Excel, CSV, tabular records' },
  { id: 'presentations', name: 'Presentations', extensions: ['.pptx', '.ppt', '.odp'], description: 'PowerPoint & slide decks' },
  { id: 'audio', name: 'Audio Files', extensions: ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.opus', '.aac'], description: 'Voice recordings & podcasts' },
  { id: 'video', name: 'Video Files', extensions: ['.mp4', '.mkv', '.avi', '.mov', '.webm'], description: 'Video recordings & footage' },
  { id: 'images', name: 'Images & Photos', extensions: ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'], description: 'Photographs & diagram graphics' },
  { id: 'subtitles', name: 'Subtitles & Transcripts', extensions: ['.srt', '.vtt'], description: 'Captions & aligned transcripts' },
  { id: 'data', name: 'Data & Datasets', extensions: ['.json', '.jsonl', '.xml', '.parquet', '.arrow'], description: 'Structured datasets and JSON records' },
  { id: 'archives', name: 'Archives & Compressed', extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'], description: 'Bundled datasets and archives' },
  { id: 'code', name: 'Source Code & Scripts', extensions: ['.py', '.js', '.ts', '.html', '.css', '.sql', '.yaml', '.yml'], description: 'Source code & markup' },
];

export const ALL_SUPPORTED_EXTENSIONS = Array.from(
  new Set(STANDARDIZED_FILE_GROUPS.flatMap((g) => g.extensions))
);

