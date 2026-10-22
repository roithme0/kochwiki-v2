import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DialogHeaderComponent } from '../../../core/components/dialog-header/dialog-header.component';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffFormComponent } from '../../components/foodstuff-form/foodstuff-form.component';
import type {
  FoodstuffCreate,
  FoodstuffOut,
} from '../../../core/api/generated';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';

@Component({
  selector: 'app-foodstuff-create-dialog',
  imports: [DialogHeaderComponent, FoodstuffFormComponent, MatDialogModule],
  templateUrl: './foodstuff-create-dialog.component.html',
  styleUrl: './foodstuff-create-dialog.component.scss',
})
export class FoodstuffCreateDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<FoodstuffCreateDialogComponent, FoodstuffOut>,
  );
  private readonly foodstuffBackendService = inject(FoodstuffBackendService);
  private readonly snackBarService = inject(SnackBarService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly initialDisableClose = this.dialogRef.disableClose;
  readonly submitting = signal(false);
  private readonly uploading = signal(false);
  readonly busy = computed(() => this.submitting() || this.uploading());

  onUploadingChange(uploading: boolean): void {
    this.uploading.set(uploading);
    this.dialogRef.disableClose = this.busy() || this.initialDisableClose;
  }

  async onSubmit(foodstuff: FoodstuffCreate): Promise<void> {
    if (this.submitting() || this.destroyRef.destroyed) return;
    this.submitting.set(true);
    this.dialogRef.disableClose = true;
    try {
      const created =
        await this.foodstuffBackendService.postFoodstuff(foodstuff);
      if (this.destroyRef.destroyed) return;
      this.foodstuffBackendService.notifyFoodstuffsChanged();
      this.dialogRef.close(created);
      this.snackBarService.open('Lebensmittel erstellt');
    } catch (error: unknown) {
      if (this.destroyRef.destroyed) return;
      console.error('failed to create foodstuff: ', error);
      this.snackBarService.open('Lebensmittel konnte nicht erstellt werden');
    } finally {
      this.submitting.set(false);
      this.dialogRef.disableClose = this.busy() || this.initialDisableClose;
    }
  }
}
