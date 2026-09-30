import type { RecipeVersionOut } from '../../../core/api/generated';
import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { LoadState } from '../../../core/utils/load-state';
import { RecipeCreateDialogComponent } from '../../dialogs/recipe-create-dialog/recipe-create-dialog.component';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipesGridComponent } from '../../components/recipes-grid/recipes-grid.component';
import { RecipesSearchComponent } from '../../components/recipes-search/recipes-search.component';

@Component({
  selector: 'app-recipes-page',
  imports: [
    CommonModule,
    RecipesGridComponent,
    RecipesSearchComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './recipes-page.component.html',
  styleUrl: './recipes-page.component.scss',
})
export class RecipesPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private isDestroyed = false;
  private readonly recipeBackendService = inject(RecipeBackendService);
  private readonly snackBarService = inject(SnackBarService);
  readonly dialog = inject(MatDialog);
  readonly pageHeaderService = inject(PageHeaderService);

  readonly showSearch = signal(false);
  readonly recipeVersionsState = signal<LoadState<RecipeVersionOut[]>>({
    status: 'loading',
    data: [],
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
    });
  }

  ngOnInit(): void {
    this.pageHeaderService.updateHeader(true, 'Rezepte', '', true);
    this.recipeBackendService.recipesChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.fetchRecipeVersions());
    void this.fetchRecipeVersions();
  }

  openCreateRecipeDialog(): void {
    this.dialog.open(RecipeCreateDialogComponent, {
      minWidth: 'calc(100vw - 1rem)',
      maxWidth: 'calc(100vw - 1rem)',
      height: 'calc(100dvh - 1rem)',
      maxHeight: 'calc(100dvh - 1rem)',
      position: { top: '0.5rem', left: '0.5rem' },
      autoFocus: false,
      disableClose: true,
    });
  }

  private async fetchRecipeVersions(): Promise<void> {
    this.recipeVersionsState.update(({ data }) => ({ status: 'loading', data }));
    try {
      const recipeVersions = await this.recipeBackendService.getAllRecipeVersions();
      if (this.isDestroyed) return;
      this.recipeVersionsState.set({
        status: 'success',
        data: recipeVersions,
      });
    } catch (error: unknown) {
      if (this.isDestroyed) return;
      console.error('failed to fetch recipe versions: ', error);
      this.snackBarService.open('Rezepte konnten nicht geladen werden');
      this.recipeVersionsState.update(({ data }) => ({ status: 'error', data }));
    }
  }
}
