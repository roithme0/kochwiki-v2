import { Injectable, inject } from '@angular/core';
import type {
  FoodstuffImageDownloadOut,
  FoodstuffImageOut,
} from '../../core/api/generated';
import {
  zFoodstuffImageDownloadOut,
  zFoodstuffImageOut,
  zFoodstuffImageUploadOut,
} from '../../core/api/generated/zod.gen';
import { backendUrl } from '../../core/constants/api';
import { ImageTransferService } from '../../core/services/image-transfer.service';

@Injectable({ providedIn: 'root' })
export class FoodstuffImageService {
  private readonly transfers = inject(ImageTransferService);

  download(imageId: string): Promise<FoodstuffImageDownloadOut> {
    return this.transfers.download(
      `${backendUrl}/foodstuff-images/${encodeURIComponent(imageId)}/download`,
      zFoodstuffImageDownloadOut,
    );
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
