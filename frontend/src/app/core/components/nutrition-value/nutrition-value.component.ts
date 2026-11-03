import { Component, computed, inject, input, LOCALE_ID } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import {
  NutritionResult,
  formatNutritionResult,
} from '../../models/nutrition-result';

@Component({
  selector: 'app-nutrition-value',
  imports: [MatCardModule],
  templateUrl: './nutrition-value.component.html',
  styleUrl: './nutrition-value.component.scss',
})
export class NutritionValueComponent {
  readonly label = input.required<string>();
  readonly value = input.required<NutritionResult>();
  private readonly locale = inject(LOCALE_ID);

  readonly displayedValue = computed((): string => {
    const value = this.value();
    const formatted = formatNutritionResult(value, 1, this.locale);
    return value.status === 'unknown' ? formatted : `${formatted}\u00a0g`;
  });
}
