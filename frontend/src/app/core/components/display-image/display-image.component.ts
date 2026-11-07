import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-display-image',
  templateUrl: './display-image.component.html',
  styleUrl: './display-image.component.scss',
})
export class DisplayImageComponent {
  readonly src = input.required<string | null>();
  readonly placeholder = input.required<string>();
  readonly alt = input('');
  readonly dimensions = input<{ width: number; height: number } | null>(null);
  readonly imageUrl = signal<string | null>(null);
  readonly loading = signal(false);
  readonly generation = signal(0);
  private request = 0;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      const src = this.src();
      this.generation.set(++this.request);
      this.imageUrl.set(src);
      this.loading.set(src !== null);
    });
  }

  imageLoaded(url: string, generation: number): void {
    if (!this.isCurrent(url, generation)) return;
    this.loading.set(false);
  }

  imageLoadFailed(url: string, generation: number): void {
    if (!this.isCurrent(url, generation)) return;
    this.imageUrl.set(null);
    this.loading.set(false);
  }

  private isCurrent(url: string, generation: number): boolean {
    return (
      !this.destroyRef.destroyed &&
      this.imageUrl() === url &&
      this.generation() === generation
    );
  }
}
