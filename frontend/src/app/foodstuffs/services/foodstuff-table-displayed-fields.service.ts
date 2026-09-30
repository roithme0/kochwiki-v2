import { Injectable, inject, computed } from '@angular/core';
import { WindowWidthService } from '../../core/services/window-width.service';
import type { FoodstuffField } from '../models/foodstuff-labels';

type DisplayedField = FoodstuffField | 'chart' | 'edit' | 'delete';

@Injectable({
  providedIn: 'root',
})
export class FoodstuffTableDisplayedFieldsService {
  private readonly windowWidthService = inject(WindowWidthService);

  displayedFields = computed((): DisplayedField[] => {
    const windowInnerWidth = this.windowWidthService.getWindowInnerWidth()();
    const displayedFields: DisplayedField[] = ['chart', 'name'];
    if (windowInnerWidth > 500) {
      displayedFields.push('brand');
    }
    if (windowInnerWidth > 700) {
      displayedFields.push('kcal');
    }
    if (windowInnerWidth > 1100) {
      displayedFields.push('carbs', 'protein', 'fat');
    }
    if (windowInnerWidth > 1200) {
      displayedFields.push('unit');
    }
    displayedFields.push('edit', 'delete');
    return displayedFields;
  });
}
