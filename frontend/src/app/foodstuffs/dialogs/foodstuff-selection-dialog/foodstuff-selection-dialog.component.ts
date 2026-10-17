import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FoodstuffCreateDialogComponent } from '../foodstuff-create-dialog/foodstuff-create-dialog.component';
import {
  Component,
  DestroyRef,
  computed,
  inject,
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
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FoodstuffsSearchComponent } from '../../components/foodstuffs-search/foodstuffs-search.component';

export interface FoodstuffSelectionDialogData {
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
    MatProgressSpinnerModule,
  ],
  templateUrl: './foodstuff-selection-dialog.component.html',
  styleUrl: './foodstuff-selection-dialog.component.scss',
})
export class FoodstuffSelectionDialogComponent {
  readonly data = inject<FoodstuffSelectionDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<FoodstuffSelectionDialogComponent, FoodstuffOut[]>>(
      MatDialogRef,
    );
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly foodstuffBackendService = inject(FoodstuffBackendService);

  readonly foodstuffs = signal<FoodstuffOut[]>([]);
  readonly catalogueState = signal<'loading' | 'ready' | 'error'>('loading');

  readonly searchValue = signal('');
  readonly existingFoodstuffIds = new Set(this.data.existingFoodstuffIds);
  private readonly pendingFoodstuffs = signal<ReadonlyMap<number, FoodstuffOut>>(
    new Map(),
  );
  private catalogueRequest = 0;
  readonly selectedFoodstuffIds = computed(
    () => new Set(this.pendingFoodstuffs().keys()),
  );
  readonly selectedFoodstuffs = computed(
    () => [...this.pendingFoodstuffs().values()],
  );
  readonly displayedFoodstuffs = computed((): FoodstuffOut[] => {
    const query = this.searchValue().toLowerCase();
    return this.foodstuffs().filter(
      (foodstuff) =>
        foodstuff.name.toLowerCase().includes(query) ||
        (foodstuff.brand?.toLowerCase().includes(query) ?? false),
    );
  });

  ngOnInit(): void {
    this.foodstuffBackendService.foodstuffsChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.loadFoodstuffs());
    void this.loadFoodstuffs();
  }

  async loadFoodstuffs(): Promise<void> {
    const request = ++this.catalogueRequest;
    this.catalogueState.set('loading');
    try {
      const foodstuffs = await this.foodstuffBackendService.getAllFoodstuffs();
      if (this.destroyRef.destroyed || request !== this.catalogueRequest) return;
      this.foodstuffs.set([...foodstuffs].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ));
      this.catalogueState.set('ready');
    } catch (error: unknown) {
      if (this.destroyRef.destroyed || request !== this.catalogueRequest) return;
      console.error('failed to fetch foodstuffs: ', error);
      this.catalogueState.set('error');
    }
  }

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
        this.foodstuffs.update((foodstuffs) => [
          ...foodstuffs.filter((foodstuff) => foodstuff.id !== created.id),
          created,
        ]);
        this.pendingFoodstuffs.update((pending) =>
          new Map(pending).set(created.id, created),
        );
      });
  }

  confirmSelection(): void {
    if (this.selectedFoodstuffIds().size === 0) return;
    this.dialogRef.close(this.selectedFoodstuffs());
  }

  toggleFoodstuff(id: number): void {
    if (this.existingFoodstuffIds.has(id)) return;

    const foodstuff = this.foodstuffs().find((item) => item.id === id);
    this.pendingFoodstuffs.update((pending) => {
      const next = new Map(pending);
      if (next.has(id)) next.delete(id);
      else if (foodstuff) next.set(id, foodstuff);
      return next;
    });
  }
}
