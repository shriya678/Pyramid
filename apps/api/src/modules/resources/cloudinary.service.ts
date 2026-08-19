import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export interface CloudinarySignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  uploadUrl: string;
  /** Cloudinary `type` parameter — files stored authenticated are private by default. */
  resourceType: 'auto';
  type: 'authenticated';
}

/**
 * Signed upload params for a PUBLIC image (Cloudinary `type=upload`). Used
 * by inline images pasted into comments — the returned URL is embedded
 * directly in the ProseMirror doc and needs to keep working without
 * re-signing on every read.
 *
 * Trade-off vs `type=authenticated`: any URL leak lets anyone view the
 * image. Documented in README. For a task-comment attachment this is
 * usually fine; sensitive content should still use the file-upload
 * (authenticated) flow.
 */
export interface CloudinarySignedInlineImage {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  uploadUrl: string;
  resourceType: 'image';
  type: 'upload';
}

/**
 * Wraps the Cloudinary SDK. Two operations:
 *   1. `signUpload(taskId)` — returns the params the browser needs to upload
 *      a file directly to Cloudinary (bytes never touch our server).
 *   2. `signReadUrl(publicId)` — mints a short-lived signed URL for reading
 *      an authenticated (private) asset. Frontend re-fetches this on demand.
 *
 * Failure-mode design: if Cloudinary env vars are missing at boot, we throw
 * on the first request rather than crashing the process — the rest of the
 * app should still work in local dev without Cloudinary set up.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly cloudName: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;
  private readonly baseFolder: string;
  private configured = false;

  constructor(config: ConfigService) {
    this.cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
    this.apiKey = config.get<string>('CLOUDINARY_API_KEY');
    this.apiSecret = config.get<string>('CLOUDINARY_API_SECRET');
    this.baseFolder = config.get<string>('CLOUDINARY_UPLOAD_PRESET') ?? 'task_mgmt_uploads';

    if (this.cloudName && this.apiKey && this.apiSecret) {
      cloudinary.config({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        secure: true,
      });
      this.configured = true;
    } else {
      this.logger.warn(
        'CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET not set — file upload endpoints will 500 until they are.',
      );
    }
  }

  /**
   * Build a signed upload payload for one task. The signature covers folder
   * and timestamp; the browser adds `file` + these params, POSTs to Cloudinary,
   * and gets back the public_id which we then persist as `cloudinaryKey`.
   */
  signUpload(taskId: string): CloudinarySignedUpload {
    this.requireConfigured();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `${this.baseFolder}/tasks/${taskId}`;
    // NB: params to sign must be alphabetically ordered by key inside the SDK's
    // api_sign_request helper — we let the SDK handle that, just pass a plain object.
    const signature = cloudinary.utils.api_sign_request(
      { folder, timestamp, type: 'authenticated' },
      this.apiSecret!,
    );
    return {
      cloudName: this.cloudName!,
      apiKey: this.apiKey!,
      timestamp,
      signature,
      folder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`,
      resourceType: 'auto',
      type: 'authenticated',
    };
  }

  /**
   * Signed params for a PUBLIC image upload (Cloudinary `type=upload`).
   * Used by inline images pasted into comments — the returned URL is
   * embedded in the ProseMirror doc as an <img src> and needs to work
   * forever without server-side signing on each read.
   *
   * Different folder path than task-scoped file uploads so we can tell
   * the two apart in the Cloudinary console and reconcile independently.
   * Bound to a task so that stray uploads still have provenance.
   */
  signInlineImageUpload(taskId: string): CloudinarySignedInlineImage {
    this.requireConfigured();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `${this.baseFolder}/inline-images/tasks/${taskId}`;
    const signature = cloudinary.utils.api_sign_request({ folder, timestamp }, this.apiSecret!);
    return {
      cloudName: this.cloudName!,
      apiKey: this.apiKey!,
      timestamp,
      signature,
      folder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      resourceType: 'image',
      type: 'upload',
    };
  }

  /**
   * Mint a 5-minute signed URL for a private (authenticated) asset. Returned
   * URL is safe to hand to the browser — it expires and can't be re-shared
   * long-term.
   */
  signReadUrl(publicId: string): string {
    this.requireConfigured();
    const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;
    return cloudinary.utils.private_download_url(publicId, '', {
      resource_type: 'image',
      type: 'authenticated',
      expires_at: expiresAt,
    });
  }

  private requireConfigured(): void {
    if (!this.configured) {
      throw new InternalServerErrorException(
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET.',
      );
    }
  }
}
