import type { RecipeVersionOut } from '../../../core/api/generated';
import { Component, input } from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import { RecipeVersionStateBadgeComponent } from '../../components/recipe-version-state-badge/recipe-version-state-badge.component';

@Component({
  selector: 'app-recipes-grid-element',
  imports: [MatCardModule, MacroChartComponent, RecipeVersionStateBadgeComponent],
  templateUrl: './recipes-grid-element.component.html',
  styleUrl: './recipes-grid-element.component.scss',
})
export class RecipesGridElementComponent {
  recipeVersion = input.required<RecipeVersionOut>();
}
