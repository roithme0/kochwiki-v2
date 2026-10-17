import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import type { FoodstuffOut } from '../../../core/api/generated';
import { DialogHeaderComponent } from '../../../core/components/dialog-header/dialog-header.component';
import { FoodstuffsSearchComponent } from '../../components/foodstuffs-search/foodstuffs-search.component';

export interface FoodstuffSelectionDialogData {
  foodstuffs: FoodstuffOut[];
}

@Component({
  selector: 'app-foodstuff-selection-dialog',
  imports: [DialogHeaderComponent, FoodstuffsSearchComponent, MatDialogModule, MatListModule, MatButtonModule],
  templateUrl: './foodstuff-selection-dialog.component.html',
  styleUrl: './foodstuff-selection-dialog.component.scss',
})
export class FoodstuffSelectionDialogComponent {
  readonly data = inject<FoodstuffSelectionDialogData>(MAT_DIALOG_DATA);

  readonly searchValue = signal('');
  readonly displayedFoodstuffs = computed((): FoodstuffOut[] => {
    const query = this.searchValue().toLowerCase();
    return this.data.foodstuffs.filter((foodstuff) =>
      foodstuff.name.toLowerCase().includes(query) ||
      (foodstuff.brand?.toLowerCase().includes(query) ?? false)
    );
  });
}
