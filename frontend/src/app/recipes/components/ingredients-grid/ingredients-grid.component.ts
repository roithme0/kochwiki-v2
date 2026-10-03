import { Component, computed, input } from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import {
  RecipePresentation,
  RecipePresentationIngredient,
} from '../../models/recipe-presentation';

@Component({
  selector: 'app-ingredients-grid',
  imports: [
    MatCardModule,
    MacroChartComponent
],
  templateUrl: './ingredients-grid.component.html',
  styleUrl: './ingredients-grid.component.scss',
})
export class IngredientsGridComponent {
  readonly recipe = input.required<RecipePresentation>();

  readonly ingredientsSorted = computed((): RecipePresentationIngredient[] =>
    [...this.recipe().ingredients].sort(
      (a: RecipePresentationIngredient, b: RecipePresentationIngredient) =>
        a.index - b.index
    )
  );
}
