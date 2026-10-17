import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ZodMiniType } from 'zod/mini';
import { requestApiResponse } from '../api/request-api-response';

interface UploadInstructions {
  uploadId: string;
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class ImageTransferService {
  private readonly http = inject(HttpClient);

  async download<T extends { url: string }>(
    url: string,
    schema: ZodMiniType<T>,
  ): Promise<T> {
    const download = await requestApiResponse(this.http, 'GET', url, schema);
    return { ...download, url: this.storageUrl(download.url) };
  }

  async upload<T>(
    file: File,
    url: string,
    instructionsSchema: ZodMiniType<UploadInstructions>,
    imageSchema: ZodMiniType<T>,
  ): Promise<T> {
    const upload = await requestApiResponse(
      this.http,
      'POST',
      url,
      instructionsSchema,
    );
    await firstValueFrom(
      this.http.request(upload.method, this.storageUrl(upload.url), {
        body: file,
        headers: upload.headers,
        responseType: 'text',
      }),
    );
    return requestApiResponse(
      this.http,
      'POST',
      `${url}/${upload.uploadId}/complete`,
      imageSchema,
    );
  }

  private storageUrl(url: string): string {
    const parsed = new URL(url, window.location.origin);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !parsed.pathname.startsWith('/storage/') ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    ) {
      throw new Error('Invalid image storage URL');
    }
    return parsed.pathname + parsed.search;
  }
}
