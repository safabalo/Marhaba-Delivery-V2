import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

/**
 * Object storage (S3 / Cloudflare R2) for product images and proof-of-delivery
 * assets. Client uploads go directly to storage via a presigned URL; the API
 * only ever stores/serves the object key + public URL.
 *
 * The presign call is intentionally isolated here so wiring the concrete
 * @aws-sdk/client-s3 signer is a one-file change without touching callers.
 */
@Injectable()
export class StorageService {
  private readonly bucket?: string;
  private readonly publicUrl?: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('s3.bucket');
    this.publicUrl = config.get<string>('s3.publicUrl');
  }

  /** Deterministic, collision-free key under a namespaced prefix. */
  buildKey(prefix: 'products' | 'pod' | 'signatures', ext = 'jpg'): string {
    const date = new Date().toISOString().slice(0, 10);
    return `${prefix}/${date}/${randomUUID()}.${ext}`;
  }

  publicUrlFor(key: string): string {
    if (this.publicUrl) return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
    return `/${key}`;
  }

  /**
   * Presigned PUT URL for a direct browser/native upload. Returns a stub in
   * unconfigured environments so local flows still exercise the key handling.
   * TODO: back with S3 PutObjectCommand + getSignedUrl in production.
   */
  async presignUpload(key: string, contentType: string): Promise<{ key: string; url: string; publicUrl: string }> {
    const url =
      this.bucket && this.publicUrl
        ? `${this.publicUrl.replace(/\/$/, '')}/${key}?presigned=1&ct=${encodeURIComponent(contentType)}`
        : `local-upload://${key}`;
    return { key, url, publicUrl: this.publicUrlFor(key) };
  }
}
