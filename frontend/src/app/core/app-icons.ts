import { inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

export function registerAppIcons(): void {
  const registry = inject(MatIconRegistry);
  const sanitizer = inject(DomSanitizer);

  for (const name of ['home', 'hide_image'] as const) {
    registry.addSvgIcon(
      name,
      sanitizer.bypassSecurityTrustResourceUrl(`assets/icons/${name}.svg`),
    );
  }
}
