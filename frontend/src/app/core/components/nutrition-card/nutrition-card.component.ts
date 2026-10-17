import { Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { NutritionSummary } from '../../models/nutrition-result';
import { buildNutritionLegend } from '../../utils/nutrition-legend';
import { ChartLegendElementComponent } from '../chart-legend-element/chart-legend-element.component';
import { MacroChartComponent } from '../macro-chart/macro-chart.component';

@Component({
  selector: 'app-nutrition-card',
  imports: [MatCardModule, ChartLegendElementComponent, MacroChartComponent],
  templateUrl: './nutrition-card.component.html',
  styleUrl: './nutrition-card.component.scss',
})
export class NutritionCardComponent {
  readonly nutrition = input.required<NutritionSummary>();
  readonly basis = input.required<string>();
  readonly showHeader = input(true);
  readonly showLegend = input(true);

  readonly nutrientLegend = computed(() =>
    Object.values(buildNutritionLegend(this.nutrition())),
  );
}
