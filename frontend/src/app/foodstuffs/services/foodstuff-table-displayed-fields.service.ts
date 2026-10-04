import { Injectable, computed, Signal } from '@angular/core';
import type { FoodstuffField } from '../models/foodstuff-labels';

type DisplayedField = FoodstuffField | 'chart' | 'edit' | 'delete';

@Injectable({
  providedIn: 'root',
})
export class FoodstuffTableDisplayedFieldsService {
  getDisplayedFields(width: Signal<number>): Signal<DisplayedField[]> {
    return computed((): DisplayedField[] => {
      const elementWidth = width();
      const displayedFields: DisplayedField[] = ['chart', 'name'];
      if (elementWidth > 500) {
        displayedFields.push('brand');
      }
      if (elementWidth > 700) {
        displayedFields.push('kcal');
      }
      if (elementWidth > 1100) {
        displayedFields.push('carbs', 'protein', 'fat');
      }
      if (elementWidth > 1200) {
        displayedFields.push('unit');
      }
      displayedFields.push('edit', 'delete');
      return displayedFields;
    });
  }
}
