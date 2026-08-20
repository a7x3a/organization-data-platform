import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { logger } from '../utils/logger';

class R2Service {
  private client: S3Client | null = null;
  private bucket: string;

  constructor() {
    this.bucket = env.R2_BUCKET || '';
    if (env.STORAGE_PROVIDER === 'r2') {
      this.client = new S3Client({
        region: env.R2_REGION,
        endpoint: env.R2_ENDPOINT,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID!,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
        },
        // Force path-style for R2 compatibility
        forcePathStyle: true,
      });
    }
  }

  private getClient(): S3Client {
    if (!this.client) {
      throw new Error('R2Service client is not initialized (STORAGE_PROVIDER is not r2)');
    }
    return this.client;
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

    const url = await getSignedUrl(this.getClient(), command, {
      expiresIn: env.R2_SIGNED_URL_EXPIRES,
    });

    const expiresAt = new Date(
      Date.now() + env.R2_SIGNED_URL_EXPIRES * 1000
    ).toISOString();

    logger.debug({ key, expiresAt }, 'r2_signed_url_generated');
    return { url, expiresAt };
  }

  /**
   * Download a buffer from R2 (for reading manifests and metadata files).
   */
  async getBuffer(key: string): Promise<Buffer | null> {
    try {
      const response = await this.getClient().send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
      if (!response.Body) return null;
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err: unknown) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Check whether an object exists in R2 without downloading it.
   */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.getClient().send(
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
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    logger.info({ key, contentType }, 'r2_upload_completed');
  }

  /**
   * Permanently delete an object from R2. There is no undo — callers are
   * responsible for deciding whether deleting a given key is appropriate
   * (see file.service.ts's deleteFile for the immutability tradeoff this
   * makes for collected files specifically).
   */
  async deleteObject(key: string): Promise<void> {
    await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    logger.info({ key }, 'r2_delete_completed');
  }
}

// Singleton instance
export const r2Service = new R2Service();
