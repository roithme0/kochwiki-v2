import { Component, computed, input } from '@angular/core';
import { NutritionCardComponent } from '../../../core/components/nutrition-card/nutrition-card.component';
import type { Unit } from '../../../core/api/generated';
import type { FoodstuffPresentation } from '../../presentation/foodstuff-artifact';

const NUTRITION_BASIS: Record<Unit, string> = {
  G: 'pro 100 g',
  ML: 'pro 100 ml',
  PIECE: 'pro St\u00fcck',
};

@Component({
  selector: 'app-foodstuff-presentation',
  imports: [NutritionCardComponent],
  template: '<app-nutrition-card [nutrition]="foodstuff()" [basis]="basis()" />',
})
export class FoodstuffPresentationComponent {
  readonly foodstuff = input.required<FoodstuffPresentation>();
  readonly basis = computed(() => NUTRITION_BASIS[this.foodstuff().unit]);
}
