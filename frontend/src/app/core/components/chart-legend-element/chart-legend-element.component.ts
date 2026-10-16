import { Component, computed, inject, input, LOCALE_ID } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { ChartLegendElement } from '../../models/chart-legend-element';
import { formatNutritionResult } from '../../models/nutrition-result';

@Component({
  selector: 'app-chart-legend-element',
  imports: [MatCardModule],
  templateUrl: './chart-legend-element.component.html',
  styleUrl: './chart-legend-element.component.scss',
})
export class ChartLegendElementComponent {
  legendElement = input.required<ChartLegendElement>();

  private readonly locale = inject(LOCALE_ID);
  
  readonly displayedValue = computed((): string => {
    const value = this.legendElement().value;
    const formatted = formatNutritionResult(value, 1, this.locale);
    return value.status === 'unknown' ? formatted : `${formatted}\u00a0g`;
  });
  displayedValuePercentage = computed((): number | null => {
    const valuePercentage: number | null | undefined =
      this.legendElement().valuePercentage;
    return valuePercentage == null ? null : this.round(valuePercentage, 1);
  });

  private round(value: number, precision: number): number {
    const multiplier = Math.pow(10, precision);
    return Math.round(value * multiplier) / multiplier;
  }
}
