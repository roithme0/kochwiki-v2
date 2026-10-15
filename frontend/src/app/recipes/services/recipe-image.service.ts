import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RecipeImageDownloadOut, RecipeImageOut } from '../../core/api/generated';
import {
  zRecipeImageOut,
  zRecipeImageDownloadOut,
  zRecipeImageUploadOut,
} from '../../core/api/generated/zod.gen';
import { requestApiResponse } from '../../core/api/request-api-response';
import { backendUrl } from '../../core/constants/api';

@Injectable({ providedIn: 'root' })
export class RecipeImageService {
  private readonly http = inject(HttpClient);

  download(imageId: string): Promise<RecipeImageDownloadOut> {
    return requestApiResponse(
      this.http,
      'GET',
      `${backendUrl}/recipe-images/${encodeURIComponent(imageId)}/download`,
      zRecipeImageDownloadOut,
    );
  }

  async upload(file: File): Promise<RecipeImageOut> {
    const upload = await requestApiResponse(
      this.http,
      'POST',
      backendUrl + '/recipe-image-uploads',
      zRecipeImageUploadOut,
    );
    await firstValueFrom(
      this.http.request(upload.method, upload.url, {
        body: file,
        headers: upload.headers,
        responseType: 'text',
      }),
    );
    return requestApiResponse(
      this.http,
      'POST',
      `${backendUrl}/recipe-image-uploads/${upload.uploadId}/complete`,
      zRecipeImageOut,
    );
  }
}
