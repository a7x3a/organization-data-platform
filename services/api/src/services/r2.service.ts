import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { logger } from '../utils/logger';

class R2Service {
  private client: S3Client;
  private bucket: string;

  constructor() {
    // R2_* are optional in env.ts (local storage needs none of them), but
    // validateEnv() enforces their presence whenever STORAGE_PROVIDER=r2.
    // This singleton is constructed at module load regardless of mode (the
    // AWS SDK doesn't validate config until a request is actually sent), but
    // its methods are only ever called when storageProvider resolves to
    // R2StorageProvider — i.e. STORAGE_PROVIDER=r2.
    this.bucket = env.R2_BUCKET!;
    this.client = new S3Client({
      region: env.R2_REGION,
      endpoint: env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
      // Force path-style for R2 compatibility
      forcePathStyle: true,
    });
  }

  /**
   * Generate a pre-signed GET URL for a private R2 object.
   * R2 credentials are NEVER sent to the client.
   */
  async generateSignedUrl(key: string): Promise<{ url: string; expiresAt: string }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: env.R2_SIGNED_URL_EXPIRES,
    });

    const expiresAt = new Date(
      Date.now() + env.R2_SIGNED_URL_EXPIRES * 1000
    ).toISOString();

    logger.debug({ key, expiresAt }, 'r2_signed_url_generated');
    return { url, expiresAt };
  }

  /**
   * Check whether an object exists in R2 without downloading it.
   */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return true;
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e.name === 'NotFound' || e.name === '404') return false;
      throw err;
    }
  }

  /**
   * Upload a small buffer to R2 (for manifests and metadata files).
   * For large file uploads, use the Python scraper's streaming upload.
   */
  async uploadBuffer(
    key: string,
    body: Buffer | string,
    contentType: string
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    logger.info({ key, contentType }, 'r2_upload_completed');
  }
}

// Singleton instance
export const r2Service = new R2Service();
