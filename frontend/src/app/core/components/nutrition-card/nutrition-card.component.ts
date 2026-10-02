import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { NutritionValues } from '../../models/nutrition-values';
import { buildNutritionLegend, hasMacroDistribution } from '../../utils/nutrition-legend';
import { ChartLegendElementComponent } from '../chart-legend-element/chart-legend-element.component';
import { MacroChartComponent } from '../macro-chart/macro-chart.component';

@Component({
  selector: 'app-nutrition-card',
  imports: [DecimalPipe, MatCardModule, MatIconModule, ChartLegendElementComponent, MacroChartComponent],
  templateUrl: './nutrition-card.component.html',
  styleUrl: './nutrition-card.component.scss',
})
export class NutritionCardComponent {
  readonly nutrition = input.required<NutritionValues>();
  readonly basis = input.required<string>();
  readonly showHeader = input(true);
  readonly showLegend = input(true);

  readonly showChart = computed(() => hasMacroDistribution(this.nutrition()));
  readonly nutrientLegend = computed(() => Object.values(buildNutritionLegend(this.nutrition())));
}
