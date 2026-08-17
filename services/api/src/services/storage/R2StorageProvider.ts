import { r2Service } from '../r2.service';
import type { StorageProvider } from './StorageProvider';

// Thin adapter over the existing R2Service so it satisfies the same
// StorageProvider contract as LocalStorageProvider. Business logic never
// touches the S3 client directly.
export class R2StorageProvider implements StorageProvider {
  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await r2Service.uploadBuffer(key, body, contentType);
  }

  async exists(key: string): Promise<boolean> {
    return r2Service.objectExists(key);
  }

  async getSignedUrl(key: string): Promise<{ url: string; expiresAt: string }> {
    return r2Service.generateSignedUrl(key);
  }

  async delete(key: string): Promise<void> {
    await r2Service.deleteObject(key);
  }
}
