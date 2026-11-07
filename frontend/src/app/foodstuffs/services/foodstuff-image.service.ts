import { Injectable, inject } from '@angular/core';
import type { FoodstuffImageOut } from '../../core/api/generated';
import {
  zFoodstuffImageOut,
  zFoodstuffImageUploadOut,
} from '../../core/api/generated/zod.gen';
import { backendUrl } from '../../core/constants/api';
import { ImageTransferService } from '../../core/services/image-transfer.service';

@Injectable({ providedIn: 'root' })
export class FoodstuffImageService {
  private readonly transfers = inject(ImageTransferService);

  contentUrl(imageId: string): string {
    return `${backendUrl}/foodstuff-images/${encodeURIComponent(imageId)}/content`;
  }

  upload(file: File): Promise<FoodstuffImageOut> {
    return this.transfers.upload(
      file,
      backendUrl + '/foodstuff-image-uploads',
      zFoodstuffImageUploadOut,
      zFoodstuffImageOut,
    );
  }
}
