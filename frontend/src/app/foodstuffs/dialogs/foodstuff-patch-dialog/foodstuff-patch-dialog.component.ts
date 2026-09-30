import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DialogHeaderComponent } from '../../../core/components/dialog-header/dialog-header.component';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffFormComponent } from '../../components/foodstuff-form/foodstuff-form.component';
import type { FoodstuffOut, FoodstuffUpdate } from '../../../core/api/generated';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';

interface FoodstuffPatchDialogData { id: number; }

@Component({
  selector: 'app-foodstuff-patch-dialog',
  imports: [DialogHeaderComponent, FoodstuffFormComponent, MatDialogModule],
  templateUrl: './foodstuff-patch-dialog.component.html',
  styleUrl: './foodstuff-patch-dialog.component.scss',
})
export class FoodstuffPatchDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<FoodstuffPatchDialogComponent>);
  private readonly foodstuffBackendService = inject(FoodstuffBackendService);
  private readonly snackBarService = inject(SnackBarService);
  private readonly data = inject<FoodstuffPatchDialogData>(MAT_DIALOG_DATA);

  readonly foodstuff = signal<FoodstuffOut | null>(null);

  ngOnInit(): void {
    void this.fetchFoodstuff();
  }

  async onSubmit(updates: FoodstuffUpdate): Promise<void> {
    try {
      await this.foodstuffBackendService.patchFoodstuff(this.data.id, updates);
      this.foodstuffBackendService.notifyFoodstuffsChanged();
      this.dialogRef.close();
      this.snackBarService.open('Zutat aktualisiert');
    } catch (error: unknown) {
      console.error('failed to patch foodstuff: ', error);
      this.snackBarService.open('Zutat konnte nicht aktualisiert werden');
    }
  }

  private async fetchFoodstuff(): Promise<void> {
    try {
      this.foodstuff.set(
        await this.foodstuffBackendService.getFoodstuffById(this.data.id)
      );
    } catch (error: unknown) {
      console.error('failed to fetch foodstuff: ', error);
      this.snackBarService.open('Zutat konnte nicht geladen werden');
    }
  }
}
