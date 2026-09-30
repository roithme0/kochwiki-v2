import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { DialogHeaderComponent } from '../../../core/components/dialog-header/dialog-header.component';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { isUnconfirmedRecipeWrite } from '../../services/recipe-write-error';
import { RecipeEditorComponent, RecipeEditorSubmission } from '../recipe-editor/recipe-editor.component';

@Component({
  selector: 'app-recipe-create-dialog',
  imports: [DialogHeaderComponent, MatDialogModule, RecipeEditorComponent],
  templateUrl: './recipe-create-dialog.component.html',
  styleUrl: './recipe-create-dialog.component.scss',
})
export class RecipeCreateDialogComponent {
  private readonly router = inject(Router);
  private readonly dialogRef = inject(MatDialogRef<RecipeCreateDialogComponent>);
  private readonly recipeBackendService = inject(RecipeBackendService);
  private readonly snackBarService = inject(SnackBarService);
  readonly isSubmitting = signal(false);

  async onSubmit(submission: RecipeEditorSubmission): Promise<void> {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    let createdRecipeLineageId: string;
    try {
      createdRecipeLineageId = (await this.recipeBackendService.createRecipe(submission.recipeVersion)).recipeLineageId;
    } catch (error: unknown) {
      console.error('failed to create recipe: ', error);
      this.snackBarService.open(isUnconfirmedRecipeWrite(error)
        ? 'Erstellen konnte nicht bestätigt werden. Möglicherweise wurde das Rezept bereits erstellt. Bitte vor erneutem Speichern die Rezeptliste prüfen.'
        : 'Rezept konnte nicht erstellt werden');
      this.isSubmitting.set(false);
      return;
    }

    this.recipeBackendService.notifyRecipesChanged();
    this.dialogRef.close();
    void this.navigateToRecipe(createdRecipeLineageId);
    this.snackBarService.open('Rezept erstellt');
  }

  private async navigateToRecipe(recipeLineageId: string): Promise<void> {
    try {
      await this.router.navigate(['recipes/', recipeLineageId]);
    } catch (error: unknown) {
      console.error('failed to navigate to created recipe: ', error);
    }
  }
}
