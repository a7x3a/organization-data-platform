import { env } from '../../config/env';
import { LocalStorageProvider } from './LocalStorageProvider';
import { R2StorageProvider } from './R2StorageProvider';
import type { StorageProvider } from './StorageProvider';

export type { StorageProvider };
export { LocalStorageProvider };

// STORAGE_PROVIDER=local works with zero R2 credentials (default for dev/test).
// STORAGE_PROVIDER=r2 uses real Cloudflare R2. Business logic (file.service.ts)
// only ever calls the interface — swapping providers changes nothing else.
export const storageProvider: StorageProvider =
  env.STORAGE_PROVIDER === 'r2' ? new R2StorageProvider() : new LocalStorageProvider();
