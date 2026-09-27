import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly preference = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.preference?.matches ?? false);
  private readonly override = signal<boolean | null>(null);

  readonly isDark = computed(() => this.override() ?? this.systemDark());

  constructor() {
    const updatePreference = (event: MediaQueryListEvent): void => this.systemDark.set(event.matches);
    this.preference?.addEventListener('change', updatePreference);
    inject(DestroyRef).onDestroy(() => {
      this.preference?.removeEventListener('change', updatePreference);
      this.document.documentElement.removeAttribute('data-theme');
    });
  }

  toggle(): void {
    const dark = !this.isDark();
    this.override.set(dark);
    this.document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
}
