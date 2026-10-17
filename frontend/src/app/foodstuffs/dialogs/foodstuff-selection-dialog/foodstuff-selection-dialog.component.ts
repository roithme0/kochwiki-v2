import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FoodstuffCreateDialogComponent } from '../foodstuff-create-dialog/foodstuff-create-dialog.component';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
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
  imports: [
    DialogHeaderComponent,
    FoodstuffsSearchComponent,
    MatDialogModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './foodstuff-selection-dialog.component.html',
  styleUrl: './foodstuff-selection-dialog.component.scss',
})
export class FoodstuffSelectionDialogComponent {
  readonly data = inject<FoodstuffSelectionDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<FoodstuffSelectionDialogComponent, number[]>>(
      MatDialogRef,
    );
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly foodstuffCreated = output<FoodstuffOut>();

  readonly foodstuffs = signal<FoodstuffOut[]>([...this.data.foodstuffs]);

  readonly searchValue = signal('');
  readonly existingFoodstuffIds = new Set(this.data.existingFoodstuffIds);
  readonly selectedFoodstuffIds = signal<ReadonlySet<number>>(new Set());
  readonly selectedFoodstuffs = computed((): FoodstuffOut[] =>
    [...this.selectedFoodstuffIds()]
      .map((id) => this.foodstuffs().find((foodstuff) => foodstuff.id === id))
      .filter(
        (foodstuff): foodstuff is FoodstuffOut => foodstuff !== undefined,
      ),
  );
  readonly displayedFoodstuffs = computed((): FoodstuffOut[] => {
    const query = this.searchValue().toLowerCase();
    return this.foodstuffs().filter(
      (foodstuff) =>
        foodstuff.name.toLowerCase().includes(query) ||
        (foodstuff.brand?.toLowerCase().includes(query) ?? false),
    );
  });

  openCreateFoodstuffDialog(): void {
    this.dialog
      .open<FoodstuffCreateDialogComponent, undefined, FoodstuffOut>(
        FoodstuffCreateDialogComponent,
        {
          width: '100vw',
          maxWidth: 'min(var(--app-max-width), 100vw)',
          maxHeight: '100dvh',
          position: { top: '0' },
          autoFocus: false,
          disableClose: true,
        },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((created) => {
        if (!created) return;
        this.foodstuffs.update((foodstuffs) => [...foodstuffs, created]);
        this.selectedFoodstuffIds.update(
          (selected) => new Set([...selected, created.id]),
        );
        this.foodstuffCreated.emit(created);
      });
  }

  confirmSelection(): void {
    if (this.selectedFoodstuffIds().size === 0) return;
    this.dialogRef.close([...this.selectedFoodstuffIds()]);
  }

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
