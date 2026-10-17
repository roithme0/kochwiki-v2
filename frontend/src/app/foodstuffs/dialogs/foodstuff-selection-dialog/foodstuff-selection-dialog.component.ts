import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { FoodstuffOut } from '../../../core/api/generated';
import { DialogHeaderComponent } from '../../../core/components/dialog-header/dialog-header.component';
import { FoodstuffsSearchComponent } from '../../components/foodstuffs-search/foodstuffs-search.component';

export interface FoodstuffSelectionDialogData {
  foodstuffs: FoodstuffOut[];
  existingFoodstuffIds: number[];
}

@Component({
  selector: 'app-foodstuff-selection-dialog',
  imports: [DialogHeaderComponent, FoodstuffsSearchComponent, MatDialogModule, MatListModule, MatButtonModule, MatIconModule],
  templateUrl: './foodstuff-selection-dialog.component.html',
  styleUrl: './foodstuff-selection-dialog.component.scss',
})
export class FoodstuffSelectionDialogComponent {
  readonly data = inject<FoodstuffSelectionDialogData>(MAT_DIALOG_DATA);

  readonly searchValue = signal('');
  readonly existingFoodstuffIds = new Set(this.data.existingFoodstuffIds);
  readonly selectedFoodstuffIds = signal<ReadonlySet<number>>(new Set());
  readonly displayedFoodstuffs = computed((): FoodstuffOut[] => {
    const query = this.searchValue().toLowerCase();
    return this.data.foodstuffs.filter((foodstuff) =>
      foodstuff.name.toLowerCase().includes(query) ||
      (foodstuff.brand?.toLowerCase().includes(query) ?? false)
    );
  });

  toggleFoodstuff(id: number): void {
    if (this.existingFoodstuffIds.has(id)) return;

    this.selectedFoodstuffIds.update((selected) => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
}
