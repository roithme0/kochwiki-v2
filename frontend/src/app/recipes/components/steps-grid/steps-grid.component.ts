import { Component, computed, input } from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import {
  RecipePresentation,
  RecipePresentationStep,
} from '../../models/recipe-presentation';

@Component({
  selector: 'app-steps-grid',
  imports: [MatCardModule],
  templateUrl: './steps-grid.component.html',
  styleUrl: './steps-grid.component.scss',
})
export class StepsGridComponent {
  readonly recipe = input.required<RecipePresentation>();

  readonly stepsSorted = computed((): RecipePresentationStep[] =>
    [...this.recipe().steps].sort(
      (a: RecipePresentationStep, b: RecipePresentationStep) => a.index - b.index
    )
  );
}
