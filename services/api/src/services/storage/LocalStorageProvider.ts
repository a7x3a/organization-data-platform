import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import type { StorageProvider } from './StorageProvider';

function findStorageRoot(): string {
  const envPath = env.LOCAL_STORAGE_DIR;
  if (existsSync(envPath)) {
    return path.resolve(envPath);
  }

  // Search up to find repo root storage directory
  let curr = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(curr, 'storage');
    if (existsSync(candidate)) {
      return path.resolve(candidate);
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  // Fallback to normalized path
  const fallback = path.resolve(envPath.startsWith('/app/') ? './storage' : envPath);
  try {
    mkdirSync(fallback, { recursive: true });
  } catch {
    // ignore
  }
  return fallback;
}

// Local filesystem storage — the default for development so the app is
// fully functional without any R2 credentials. Keys are relative paths
// under LOCAL_STORAGE_DIR (e.g. 00_raw/manual/kurdish-books/book-RAW-001.pdf).
export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor() {
    this.root = findStorageRoot();
  }

  private resolveKey(key: string): string {
    // Normalize key: strip leading slashes/backslashes and strip any redundant storage/ or app/storage/ prefix
    let cleanKey = key.trim().replace(/^[/\\]+/, '');
    if (cleanKey.startsWith('storage/')) {
      cleanKey = cleanKey.slice('storage/'.length);
    } else if (cleanKey.startsWith('app/storage/')) {
      cleanKey = cleanKey.slice('app/storage/'.length);
    }
    const resolved = path.resolve(this.root, cleanKey);
    // Never allow a storage key to escape the storage root.
    if (!resolved.startsWith(this.root + path.sep) && resolved !== this.root) {
      throw new Error(`Storage key resolves outside storage root: ${key}`);
    }
    return resolved;
  }

  async upload(key: string, body: Buffer | string, _contentType: string): Promise<void> {
    const filePath = this.resolveKey(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body);
    logger.info({ key }, 'local_storage_upload_completed');
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolveKey(key));
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(key));
      logger.info({ key }, 'local_storage_delete_completed');
    } catch (err: unknown) {
      // Already gone is not a failure — deleting a file record whose
      // object was somehow already removed should still succeed.
      if ((err as { code?: string }).code === 'ENOENT') return;
      throw err;
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

