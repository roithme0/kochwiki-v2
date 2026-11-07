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
  readonly generation = signal(0);
  private readonly images = inject(FoodstuffImageService);
  private readonly destroyRef = inject(DestroyRef);

  private request = 0;

  readonly placeholder = foodstuffImagePlaceholder;

  constructor() {
    effect(() => {
      this.load(this.imageId());
    });
  }

  imageLoaded(url: string, generation: number): void {
    if (
      this.destroyRef.destroyed ||
      this.imageUrl() !== url ||
      this.generation() !== generation
    )
      return;
    this.loading.set(false);
  }

  imageLoadFailed(url: string, generation: number): void {
    if (
      this.destroyRef.destroyed ||
      this.imageUrl() !== url ||
      this.generation() !== generation
    )
      return;
    this.imageUrl.set(null);
    this.loading.set(false);
  }

  private load(imageId: string | null): void {
    this.generation.set(++this.request);
    this.imageUrl.set(null);
    this.loading.set(imageId !== null);
    if (imageId === null) return;

    this.imageUrl.set(this.images.contentUrl(imageId));
  }
}
