import type { RecipeVersionState } from '../../../core/api/generated';
import { Component, input } from '@angular/core';


@Component({
  selector: 'app-recipe-version-state-badge',
  host: {
    '[hidden]': "state() === 'active'",
    '[class.draft]': "state() === 'draft'",
    '[class.historical]': "state() === 'historical'",
  },
  styleUrl: './recipe-version-state-badge.component.scss',
  template: `
    @if (state() === 'draft') {
      <span role="status">Entwurf</span>
    } @else if (state() === 'historical') {
      <span role="status">Archivierte Version</span>
    }
  `,
})
export class RecipeVersionStateBadgeComponent {
  readonly state = input.required<RecipeVersionState>();
}
