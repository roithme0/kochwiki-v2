import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { foodstuffImagePlaceholder } from '../../../core/constants/image-assets';

@Component({
  selector: 'app-foodstuff-image',
  templateUrl: './foodstuff-image.component.html',
  styleUrl: './foodstuff-image.component.scss',
})
export class FoodstuffImageComponent {
  readonly imageId = input.required<string | null>();
  readonly alt = input('');
  readonly imageUrl = signal<string | null>(null);
  readonly loading = signal(false);
  private readonly images = inject(FoodstuffImageService);
  private readonly destroyRef = inject(DestroyRef);

  private request = 0;

  readonly placeholder = foodstuffImagePlaceholder;

  constructor() {
    effect(() => {
      void this.load(this.imageId());
    });
  }

  imageLoaded(url: string): void {
    if (this.destroyRef.destroyed || this.imageUrl() !== url) return;
    this.loading.set(false);
  }

  imageLoadFailed(url: string): void {
    if (this.destroyRef.destroyed || this.imageUrl() !== url) return;
    this.imageUrl.set(null);
    this.loading.set(false);
  }

  private async load(imageId: string | null): Promise<void> {
    const request = ++this.request;
    this.imageUrl.set(null);
    this.loading.set(imageId !== null);
    if (imageId === null) return;

    try {
      const download = await this.images.download(imageId);
      if (this.destroyRef.destroyed || request !== this.request) return;
      this.imageUrl.set(download.url);
    } catch {
      if (this.destroyRef.destroyed || request !== this.request) return;
      this.loading.set(false);
    }
  }
}
