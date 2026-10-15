import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { RecipeImageService } from '../../services/recipe-image.service';

@Component({
  selector: 'app-recipe-image',
  imports: [MatButtonModule, MatProgressSpinner],
  templateUrl: './recipe-image.component.html',
  styleUrl: './recipe-image.component.scss',
})
export class RecipeImageComponent {
  readonly imageId = input.required<string | null>();
  readonly naturalHeight = input(false);
  readonly imageUrl = signal<string | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);
  private readonly images = inject(RecipeImageService);
  private readonly destroyRef = inject(DestroyRef);

  private request = 0;

  constructor() {
    effect(() => {
      void this.load(this.imageId());
    });
  }

  retry(): void {
    void this.load(this.imageId());
  }

  imageLoadFailed(): void {
    if (this.imageUrl() === null) return;
    this.imageUrl.set(null);
    this.failed.set(true);
  }

  private async load(imageId: string | null): Promise<void> {
    const request = ++this.request;
    this.imageUrl.set(null);
    this.failed.set(false);
    this.loading.set(imageId !== null);
    if (imageId === null) return;

    try {
      const download = await this.images.download(imageId);
      if (this.destroyRef.destroyed || request !== this.request) return;
      this.imageUrl.set(download.url);
    } catch {
      if (this.destroyRef.destroyed || request !== this.request) return;
      this.failed.set(true);
    } finally {
      if (!this.destroyRef.destroyed && request === this.request)
        this.loading.set(false);
    }
  }
}
