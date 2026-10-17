import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RecipeBackendService } from '../../../recipes/services/recipe-backend.service';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffCatalogueService } from '../../services/foodstuff-catalogue.service';
import { FoodstuffsSearchComponent } from '../../components/foodstuffs-search/foodstuffs-search.component';
import { FoodstuffTableControlService } from '../../services/foodstuff-table-control.service';
import { FoodstuffsTableComponent } from '../../components/foodstuffs-table/foodstuffs-table.component';
import { FoodstuffCreateDialogComponent } from '../../dialogs/foodstuff-create-dialog/foodstuff-create-dialog.component';

@Component({
  selector: 'app-foodstuffs-page',
  providers: [FoodstuffCatalogueService],
  imports: [
    FoodstuffsTableComponent,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    FoodstuffsSearchComponent,
  ],
  templateUrl: './foodstuffs-page.component.html',
  styleUrl: './foodstuffs-page.component.scss',
})
export class FoodstuffsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly catalogue = inject(FoodstuffCatalogueService);
  private readonly recipeBackendService = inject(RecipeBackendService);
  private readonly snackBarService = inject(SnackBarService);
  readonly pageHeaderService = inject(PageHeaderService);
  readonly dialog = inject(MatDialog);
  readonly foodstuffTableControlsService = inject(FoodstuffTableControlService);

  ngOnInit(): void {
    this.pageHeaderService.updateHeader(true, 'Lebensmittel', '', true);
    this.catalogue.loadFailed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.snackBarService.open('Zutaten konnten nicht geladen werden'),
      );
    this.recipeBackendService.recipesChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.catalogue.refresh());
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
}
