import { Component, computed, input } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { FoodstuffDisplayComponent } from '../../../foodstuffs/components/foodstuff-display/foodstuff-display.component';
import { RecipePresentationIngredient } from '../../models/recipe-presentation';

@Component({
  selector: 'app-ingredients-list',
  imports: [MatListModule, FoodstuffDisplayComponent],
  templateUrl: './ingredients-list.component.html',
  styleUrl: './ingredients-list.component.scss',
})
export class IngredientsListComponent {
  readonly ingredients =
    input.required<readonly RecipePresentationIngredient[]>();
  readonly ingredientsSorted = computed(() =>
    [...this.ingredients()].sort((a, b) => a.index - b.index),
  );
}
