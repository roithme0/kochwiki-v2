import { Component, input } from '@angular/core';
import { IngredientsGridComponent } from '../ingredients-grid/ingredients-grid.component';
import { RecipeMacroChartCardComponent } from '../recipe-macro-chart-card/recipe-macro-chart-card.component';
import { StepsGridComponent } from '../steps-grid/steps-grid.component';
import { RecipePresentation } from '../../models/recipe-presentation';

@Component({
  selector: 'app-recipe-presentation',
  imports: [
    IngredientsGridComponent,
    StepsGridComponent,
    RecipeMacroChartCardComponent,
  ],
  templateUrl: './recipe-presentation.component.html',
  styleUrl: './recipe-presentation.component.scss',
})
export class RecipePresentationComponent {
  readonly recipe = input.required<RecipePresentation>();
}
