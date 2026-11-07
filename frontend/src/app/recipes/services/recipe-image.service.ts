import { Injectable, inject } from '@angular/core';
import type { RecipeImageOut } from '../../core/api/generated';
import {
  zRecipeImageOut,
  zRecipeImageUploadOut,
} from '../../core/api/generated/zod.gen';
import { ImageTransferService } from '../../core/services/image-transfer.service';
import { backendUrl } from '../../core/constants/api';

@Injectable({ providedIn: 'root' })
export class RecipeImageService {
  private readonly transfers = inject(ImageTransferService);

  contentUrl(imageId: string): string {
    return `${backendUrl}/recipe-images/${encodeURIComponent(imageId)}/content`;
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
