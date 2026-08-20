// Single storage abstraction so business logic never depends on whether
// files land on local disk or Cloudflare R2. Selected via STORAGE_PROVIDER.
export interface StorageProvider {
  upload(key: string, body: Buffer | string, contentType: string): Promise<void>;
  getBuffer(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  getSignedUrl(key: string): Promise<{ url: string; expiresAt: string }>;
  delete(key: string): Promise<void>;
}
