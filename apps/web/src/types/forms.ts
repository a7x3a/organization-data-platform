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
