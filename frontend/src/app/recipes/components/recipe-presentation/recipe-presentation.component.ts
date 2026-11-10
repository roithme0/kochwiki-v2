import { Component, input } from '@angular/core';
import { IngredientsCardComponent } from '../ingredients-card/ingredients-card.component';
import { NutritionCardComponent } from '../../../core/components/nutrition-card/nutrition-card.component';
import { StepsGridComponent } from '../steps-grid/steps-grid.component';
import { RecipePresentation } from '../../models/recipe-presentation';

@Component({
  selector: 'app-recipe-presentation',
  imports: [
    IngredientsCardComponent,
    StepsGridComponent,
    NutritionCardComponent,
  ],
  templateUrl: './recipe-presentation.component.html',
  styleUrl: './recipe-presentation.component.scss',
})
export class RecipePresentationComponent {
  readonly recipe = input.required<RecipePresentation>();
}
