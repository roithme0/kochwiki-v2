import { Component, WritableSignal, input, signal } from '@angular/core';

import { ChartLegendElement } from '../../../core/models/chart-legend-element';
import { MatCardModule } from '@angular/material/card';
import { ChartLegendElementComponent } from '../../../core/components/chart-legend-element/chart-legend-element.component';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import { RecipePresentation } from '../../models/recipe-presentation';

@Component({
  selector: 'app-recipe-macro-chart-card',
  imports: [
    MatCardModule,
    ChartLegendElementComponent,
    MacroChartComponent
],
  templateUrl: './recipe-macro-chart-card.component.html',
  styleUrl: './recipe-macro-chart-card.component.scss',
})
export class RecipeMacroChartCardComponent {
  readonly recipe = input.required<RecipePresentation>();
  readonly showHeader = input<boolean>(true);
  readonly showLegend = input<boolean>(true);

  readonly legend: WritableSignal<Record<string, ChartLegendElement>> = signal({});
}
