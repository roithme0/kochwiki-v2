import { afterNextRender, DestroyRef, inject, Injectable, Injector, Signal, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ElementWidthService {
  private readonly injector = inject(Injector);

  observe(element: HTMLElement, destroyRef: DestroyRef): Signal<number> {
    const width = signal(0);
    let observer: ResizeObserver | undefined;

    const renderRef = afterNextRender(() => {
      observer = new ResizeObserver((entries) => {
        const entry = entries.find((entry) => entry.target === element);
        if (entry) width.set(entry.contentRect.width);
      });
      observer.observe(element);
    }, { injector: this.injector });

    destroyRef.onDestroy(() => {
      renderRef.destroy();
      observer?.disconnect();
    });

    return width.asReadonly();
  }
}
