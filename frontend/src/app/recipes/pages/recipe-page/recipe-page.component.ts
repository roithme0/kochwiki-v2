import { Component, DestroyRef, inject, signal, WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RecipeVersion } from '../../models/recipe';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { RecipePresentationComponent } from '../../components/recipe-presentation/recipe-presentation.component';
import { RecipePatchDialogComponent } from '../../dialogs/recipe-patch-dialog/recipe-patch-dialog.component';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '../../../core/dialogs/confirmation-dialog/confirmation-dialog.component';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { RecipeVersionStateBadgeComponent } from '../../components/recipe-version-state-badge/recipe-version-state-badge.component';

@Component({
  selector: 'app-recipe-page',
  imports: [
    RecipePresentationComponent,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinner,
    RecipeVersionStateBadgeComponent
],
  templateUrl: './recipe-page.component.html',
  styleUrl: './recipe-page.component.scss',
})
export class RecipePageComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly pageHeaderService = inject(PageHeaderService);
  readonly recipeBackendService = inject(RecipeBackendService);
  readonly snackBarService = inject(SnackBarService);
  readonly dialog = inject(MatDialog);

  recipeLineageId: string | undefined;
  recipeVersionId: string | null;
  recipeVersion: RecipeVersion | undefined;
  recipeVersionIsLoading: WritableSignal<boolean> = signal(true);

  constructor() {
    this.recipeLineageId = this.route.snapshot.paramMap.get('lineageId') ?? undefined;
    this.recipeVersionId = this.route.snapshot.paramMap.get('recipeVersionId');

    this.keepRecipeVersionUpToDate(this.recipeLineageId);
    void this.fetchRecipeVersion(this.recipeLineageId);
  }

  ngOnInit(): void {
    this.pageHeaderService.updateHeader(true, '', 'recipes', true);
  }

  keepRecipeVersionUpToDate(recipeLineageId: string | undefined): void {
    this.recipeBackendService.recipesChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.fetchRecipeVersion(recipeLineageId));
  }

  async fetchRecipeVersion(recipeLineageId: string | undefined): Promise<void> {
    if (recipeLineageId === undefined) {
      console.error('no recipe lineage id provided');
      return;
    }

    this.recipeVersionIsLoading.set(true);
    try {
      this.recipeVersion = this.recipeVersionId === null
        ? await this.recipeBackendService.getActiveRecipeVersion(recipeLineageId)
        : await this.recipeBackendService.getRecipeVersion(recipeLineageId, this.recipeVersionId);
      this.pageHeaderService.headline = this.recipeVersion.name;
    } catch (error: unknown) {
      console.error('failed to fetch recipe version: ', error);
      this.snackBarService.open('Rezept konnte nicht geladen werden');
      this.pageHeaderService.headline = 'Fehler';
    } finally {
      this.recipeVersionIsLoading.set(false);
    }
  }

  openPatchRecipeDialog(): void {
    if (this.recipeVersion === undefined || this.recipeVersion.state === 'historical') return;
    this.dialog.open(RecipePatchDialogComponent, {
      data: { recipeVersion: this.recipeVersion },
      minWidth: 'calc(100vw - 1rem)',
      maxWidth: 'calc(100vw - 1rem)',
      height: 'calc(100dvh - 1rem)',
      maxHeight: 'calc(100dvh - 1rem)',
      position: { top: '0.5rem', left: '0.5rem' },
      autoFocus: false,
      disableClose: true,
    });
  }

  openDeleteRecipeDialog(): void {
    const recipeLineageId: string | undefined = this.recipeLineageId;
    if (recipeLineageId === undefined) {
      console.error('no recipe lineage id provided');
      return;
    }

    const data: ConfirmationDialogData = {
      title: 'Gesamte Rezeptlinie löschen?',
      description: 'Das aktive Rezept, alle Entwürfe und der Versionsverlauf werden gelöscht.',
      confirmLabel: 'Ja',
      cancelLabel: 'Nein',
      action: () => this.deleteRecipeLineage(recipeLineageId),
    };

    this.dialog.open(ConfirmationDialogComponent, {
      data,
      maxWidth: '95vw',
      maxHeight: '95vh',
      autoFocus: false,
    });
  }

  openPublishDraftDialog(): void {
    const recipeVersion = this.recipeVersion;
    if (recipeVersion === undefined || recipeVersion.state !== 'draft') return;
    const data: ConfirmationDialogData = {
      title: 'Entwurf als aktive Version übernehmen?',
      description: 'Die aktuelle aktive Version wird in den Verlauf verschoben. Andere Entwürfe bleiben erhalten.',
      confirmLabel: 'Übernehmen',
      cancelLabel: 'Abbrechen',
      action: () => this.publishRecipeDraft(recipeVersion),
    };
    this.dialog.open(ConfirmationDialogComponent, {
      data,
      maxWidth: '95vw',
      maxHeight: '95vh',
      autoFocus: false,
    });
  }

  openDiscardDraftDialog(): void {
    const recipeVersion = this.recipeVersion;
    if (recipeVersion === undefined || recipeVersion.state !== 'draft') return;
    const data: ConfirmationDialogData = {
      title: 'Entwurf verwerfen?',
      confirmLabel: 'Verwerfen',
      cancelLabel: 'Abbrechen',
      action: () => this.discardRecipeDraft(recipeVersion),
    };
    this.dialog.open(ConfirmationDialogComponent, {
      data,
      maxWidth: '95vw',
      maxHeight: '95vh',
      autoFocus: false,
    });
  }

  private async deleteRecipeLineage(recipeLineageId: string): Promise<void> {
    try {
      await this.recipeBackendService.deleteRecipeLineage(recipeLineageId);
    } catch (error: unknown) {
      console.error('failed to delete recipe lineage: ', error);
      this.snackBarService.open('Rezept konnte nicht gelöscht werden');
      throw error;
    }

    try {
      await this.router.navigate(['recipes']);
    } catch (error: unknown) {
      console.error('failed to navigate after deleting recipe lineage: ', error);
    }
    this.recipeBackendService.notifyRecipesChanged();
    this.snackBarService.open('Rezeptlinie gelöscht');
  }

  private async publishRecipeDraft(recipeVersion: RecipeVersion): Promise<void> {
    try {
      await this.recipeBackendService.publishRecipeDraft(recipeVersion.recipeLineageId, recipeVersion.recipeVersionId);
    } catch (error: unknown) {
      console.error('failed to publish draft: ', error);
      this.snackBarService.open('Entwurf konnte nicht übernommen werden');
      throw error;
    }

    try {
      await this.router.navigate(['recipes', recipeVersion.recipeLineageId]);
    } catch (error: unknown) {
      console.error('failed to navigate after publishing draft: ', error);
    }
    this.recipeBackendService.notifyRecipesChanged();
    this.snackBarService.open('Entwurf als aktive Version übernommen');
  }

  private async discardRecipeDraft(recipeVersion: RecipeVersion): Promise<void> {
    try {
      await this.recipeBackendService.discardRecipeDraft(recipeVersion.recipeLineageId, recipeVersion.recipeVersionId);
    } catch (error: unknown) {
      console.error('failed to discard draft: ', error);
      this.snackBarService.open('Entwurf konnte nicht verworfen werden');
      throw error;
    }

    try {
      await this.router.navigate(['recipes']);
    } catch (error: unknown) {
      console.error('failed to navigate after discarding draft: ', error);
    }
    this.recipeBackendService.notifyRecipesChanged();
    this.snackBarService.open('Entwurf verworfen');
  }
}
