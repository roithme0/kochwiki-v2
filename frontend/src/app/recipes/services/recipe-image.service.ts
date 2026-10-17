import { Injectable, inject } from '@angular/core';
import type {
  RecipeImageDownloadOut,
  RecipeImageOut,
} from '../../core/api/generated';
import {
  zRecipeImageOut,
  zRecipeImageDownloadOut,
  zRecipeImageUploadOut,
} from '../../core/api/generated/zod.gen';
import { ImageTransferService } from '../../core/services/image-transfer.service';
import { backendUrl } from '../../core/constants/api';

@Injectable({ providedIn: 'root' })
export class RecipeImageService {
  private readonly transfers = inject(ImageTransferService);

  download(imageId: string): Promise<RecipeImageDownloadOut> {
    return this.transfers.download(
      `${backendUrl}/recipe-images/${encodeURIComponent(imageId)}/download`,
      zRecipeImageDownloadOut,
    );
  }

  upload(file: File): Promise<RecipeImageOut> {
    return this.transfers.upload(
      file,
      backendUrl + '/recipe-image-uploads',
      zRecipeImageUploadOut,
      zRecipeImageOut,
    );
  }
}
