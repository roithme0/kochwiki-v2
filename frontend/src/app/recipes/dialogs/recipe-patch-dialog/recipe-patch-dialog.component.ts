import type { RecipeVersionOut } from '../../../core/api/generated';
import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { DialogHeaderComponent } from '../../../core/components/dialog-header/dialog-header.component';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipeEditorComponent, RecipeEditorSubmission } from '../recipe-editor/recipe-editor.component';

interface RecipePatchDialogData { recipeVersion: RecipeVersionOut; }

@Component({
  selector: 'app-recipe-patch-dialog',
  imports: [DialogHeaderComponent, MatDialogModule, RecipeEditorComponent],
  templateUrl: './recipe-patch-dialog.component.html',
  styleUrl: './recipe-patch-dialog.component.scss',
})
export class RecipePatchDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<RecipePatchDialogComponent>);
  private readonly recipeBackendService = inject(RecipeBackendService);
  private readonly snackBarService = inject(SnackBarService);
  private readonly router = inject(Router);
  readonly data = inject<RecipePatchDialogData>(MAT_DIALOG_DATA);
  readonly isSubmitting = signal(false);

  async onSubmit(submission: RecipeEditorSubmission): Promise<void> {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    let savedRecipeVersion: RecipeVersionOut;
    try {
      savedRecipeVersion = this.data.recipeVersion.state === 'draft'
        ? await this.recipeBackendService.updateRecipeDraft(
            this.data.recipeVersion.recipeLineageId,
            this.data.recipeVersion.recipeVersionId,
            submission.recipeVersion,
          )
        : submission.action === 'draft'
          ? await this.recipeBackendService.createRecipeDraft(this.data.recipeVersion.recipeLineageId, submission.recipeVersion)
          : await this.recipeBackendService.publishActiveRecipeEdit(this.data.recipeVersion.recipeLineageId, submission.recipeVersion);
    } catch (error: unknown) {
      console.error('failed to save recipe version: ', error);
      this.snackBarService.open(this.data.recipeVersion.state === 'draft' ? 'Entwurf konnte nicht gespeichert werden' : 'Rezept konnte nicht aktualisiert werden');
      this.isSubmitting.set(false);
      return;
    }

    this.recipeBackendService.notifyRecipesChanged();
    this.dialogRef.close();
    if (savedRecipeVersion.state === 'draft' && this.data.recipeVersion.state === 'active') {
      this.snackBarService.open('Entwurf gespeichert');
      try {
        await this.router.navigate(['recipes', savedRecipeVersion.recipeLineageId, 'versions', savedRecipeVersion.recipeVersionId]);
      } catch (error: unknown) {
        console.error('failed to navigate to draft: ', error);
      }
      return;
    }
    this.snackBarService.open(this.data.recipeVersion.state === 'draft' ? 'Entwurf gespeichert' : 'Rezept aktualisiert');
  }
}
