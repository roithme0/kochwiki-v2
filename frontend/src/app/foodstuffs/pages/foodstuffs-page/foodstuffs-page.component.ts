
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RecipeBackendService } from '../../../recipes/services/recipe-backend.service';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import type { FoodstuffOut } from '../../../core/api/generated';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { FoodstuffsSearchComponent } from '../../components/foodstuffs-search/foodstuffs-search.component';
import { FoodstuffTableControlService } from '../../services/foodstuff-table-control.service';
import { FoodstuffsTableComponent } from '../../components/foodstuffs-table/foodstuffs-table.component';
import { FoodstuffCreateDialogComponent } from '../../dialogs/foodstuff-create-dialog/foodstuff-create-dialog.component';
import { LoadState } from '../../../core/utils/load-state';

@Component({
  selector: 'app-foodstuffs-page',
  imports: [
    FoodstuffsTableComponent,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    FoodstuffsSearchComponent
],
  templateUrl: './foodstuffs-page.component.html',
  styleUrl: './foodstuffs-page.component.scss',
})
export class FoodstuffsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private isDestroyed = false;
  private readonly foodstuffBackendService = inject(FoodstuffBackendService);
  private readonly recipeBackendService = inject(RecipeBackendService);
  private readonly snackBarService = inject(SnackBarService);
  readonly pageHeaderService = inject(PageHeaderService);
  readonly dialog = inject(MatDialog);
  readonly foodstuffTableControlsService = inject(FoodstuffTableControlService);

  readonly foodstuffsState = signal<LoadState<FoodstuffOut[]>>({
    status: 'loading',
    data: [],
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
    });
  }

  ngOnInit(): void {
    this.pageHeaderService.updateHeader(true, 'Lebensmittel', '', true);
    this.keepFoodstuffsUpToDate();
    void this.fetchFoodstuffs();
  }

  openCreateFoodstuffDialog(): void {
    this.dialog.open(FoodstuffCreateDialogComponent, {
      width: '100vw',
      maxWidth: 'min(var(--app-max-width), 100vw)',
      maxHeight: '100dvh',
      position: { top: '0' },
      autoFocus: false,
      disableClose: true,
    });
  }

  private keepFoodstuffsUpToDate(): void {
    this.foodstuffBackendService.foodstuffsChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.fetchFoodstuffs());

    this.recipeBackendService.recipesChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.fetchFoodstuffs());
  }

  private async fetchFoodstuffs(): Promise<void> {
    this.foodstuffsState.update(({ data }) => ({ status: 'loading', data }));
    try {
      const foodstuffs = await this.foodstuffBackendService.getAllFoodstuffs();
      if (this.isDestroyed) return;
      this.foodstuffsState.set({
        status: 'success',
        data: foodstuffs,
      });
    } catch (error: unknown) {
      if (this.isDestroyed) return;
      console.error('failed to fetch foodstuffs: ', error);
      this.snackBarService.open('Zutaten konnten nicht geladen werden');
      this.foodstuffsState.update(({ data }) => ({ status: 'error', data }));
    }
  }
}
