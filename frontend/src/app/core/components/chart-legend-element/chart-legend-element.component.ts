import { Component, computed, input } from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ChartLegendElement } from '../../models/chart-legend-element';

@Component({
  selector: 'app-chart-legend-element',
  imports: [MatCardModule, MatIconModule],
  templateUrl: './chart-legend-element.component.html',
  styleUrl: './chart-legend-element.component.scss',
})
export class ChartLegendElementComponent {
  legendElement = input.required<ChartLegendElement>();

  displayedValueAbsolute = computed((): number | null => {
    const valueAbsolute: number | null | undefined =
      this.legendElement().valueAbsolute;
    return valueAbsolute == null ? null : this.round(valueAbsolute, 1);
  });
  displayedValuePercentage = computed((): number | null => {
    const valuePercentage: number | null | undefined =
      this.legendElement().valuePercentage;
    return valuePercentage == null ? null : this.round(valuePercentage, 1);
  });

  private round(value: number, precision: number) {
    const multiplier = Math.pow(10, precision);
    return Math.round(value * multiplier) / multiplier;
  }
}
