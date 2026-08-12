import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import type { StorageProvider } from './StorageProvider';

// Local filesystem storage — the default for development so the app is
// fully functional without any R2 credentials. Keys are relative paths
// under LOCAL_STORAGE_DIR (e.g. 00_raw/manual/kurdish-books/book-RAW-001.pdf).
export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor() {
    this.root = path.resolve(env.LOCAL_STORAGE_DIR);
  }

  private resolveKey(key: string): string {
    const resolved = path.resolve(this.root, key);
    // Never allow a storage key to escape the storage root.
    if (!resolved.startsWith(this.root + path.sep) && resolved !== this.root) {
      throw new Error(`Storage key resolves outside storage root: ${key}`);
    }
    return resolved;
  }

  async upload(key: string, body: Buffer, _contentType: string): Promise<void> {
    const filePath = this.resolveKey(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body);
    logger.info({ key }, 'local_storage_upload_completed');
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string): Promise<{ url: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + env.R2_SIGNED_URL_EXPIRES * 1000).toISOString();
    // Served by the authenticated local-file route — local mode has no real
    // signing, access control comes from requireAuth on that route instead.
    return { url: `/api/files/local-storage/${encodeURIComponent(key)}`, expiresAt };
  }

  resolvePath(key: string): string {
    return this.resolveKey(key);
  }
}
