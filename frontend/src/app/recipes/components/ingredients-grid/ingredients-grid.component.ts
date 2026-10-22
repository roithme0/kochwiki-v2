import { Component, computed, input } from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { FoodstuffImageComponent } from '../../../foodstuffs/components/foodstuff-image/foodstuff-image.component';
import {
  RecipePresentation,
  RecipePresentationIngredient,
} from '../../models/recipe-presentation';

@Component({
  selector: 'app-ingredients-grid',
  imports: [MatCardModule, FoodstuffImageComponent],
  templateUrl: './ingredients-grid.component.html',
  styleUrl: './ingredients-grid.component.scss',
})
export class IngredientsGridComponent {
  readonly recipe = input.required<RecipePresentation>();

  readonly ingredientsSorted = computed((): RecipePresentationIngredient[] =>
    [...this.recipe().ingredients].sort(
      (a: RecipePresentationIngredient, b: RecipePresentationIngredient) =>
        a.index - b.index,
    ),
  );
}
