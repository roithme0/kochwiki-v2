import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RecipeImageService } from '../../services/recipe-image.service';
import type { RecipeImageDimensionsOut } from '../../../core/api/generated';
import { recipeImagePlaceholder } from '../../../core/constants/image-assets';

@Component({
  selector: 'app-recipe-image',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './recipe-image.component.html',
  styleUrl: './recipe-image.component.scss',
})
export class RecipeImageComponent {
  readonly imageId = input.required<string | null>();
  readonly naturalHeight = input(false);
  readonly imageDimensions = input<RecipeImageDimensionsOut | null>(null);

  readonly placeholder = recipeImagePlaceholder;

  readonly placeholderDimensions = { width: 1254, height: 747 };
  readonly dimensions = computed(() =>
    this.imageId() === null
      ? this.placeholderDimensions
      : this.imageDimensions(),
  );
  readonly aspectRatio = computed(() => {
    const dimensions = this.dimensions();
    return dimensions ? `${dimensions.width} / ${dimensions.height}` : '1';
  });
  readonly imageUrl = signal<string | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly generation = signal(0);
  private readonly images = inject(RecipeImageService);
  private readonly destroyRef = inject(DestroyRef);

  private request = 0;

  constructor() {
    effect(() => {
      this.load(this.imageId());
    });
  }

  retry(): void {
    this.load(this.imageId());
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
    this.failed.set(true);
  }

  private load(imageId: string | null): void {
    this.generation.set(++this.request);
    this.imageUrl.set(null);
    this.failed.set(false);
    this.loading.set(imageId !== null);
    if (imageId === null) return;

    this.imageUrl.set(this.images.contentUrl(imageId));
  }
}
