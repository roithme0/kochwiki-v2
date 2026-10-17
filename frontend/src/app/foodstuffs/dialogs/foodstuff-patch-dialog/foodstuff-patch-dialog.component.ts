import type { OnInit } from '@angular/core';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { DialogHeaderComponent } from '../../../core/components/dialog-header/dialog-header.component';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffFormComponent } from '../../components/foodstuff-form/foodstuff-form.component';
import type {
  FoodstuffOut,
  FoodstuffUpdate,
} from '../../../core/api/generated';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';

interface FoodstuffPatchDialogData {
  id: number;
}

@Component({
  selector: 'app-foodstuff-patch-dialog',
  imports: [DialogHeaderComponent, FoodstuffFormComponent, MatDialogModule],
  templateUrl: './foodstuff-patch-dialog.component.html',
  styleUrl: './foodstuff-patch-dialog.component.scss',
})
export class FoodstuffPatchDialogComponent implements OnInit {
  private readonly dialogRef = inject(
    MatDialogRef<FoodstuffPatchDialogComponent>,
  );
  private readonly foodstuffBackendService = inject(FoodstuffBackendService);
  private readonly snackBarService = inject(SnackBarService);
  private readonly data = inject<FoodstuffPatchDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);

  private readonly initialDisableClose = this.dialogRef.disableClose;
  readonly submitting = signal(false);
  private readonly uploading = signal(false);
  readonly busy = computed(() => this.submitting() || this.uploading());

  readonly foodstuff = signal<FoodstuffOut | null>(null);
  readonly loadFailed = signal(false);

  onUploadingChange(uploading: boolean): void {
    this.uploading.set(uploading);
    this.dialogRef.disableClose = this.busy() || this.initialDisableClose;
  }

  ngOnInit(): void {
    void this.fetchFoodstuff();
  }

  async onSubmit(updates: FoodstuffUpdate): Promise<void> {
    if (
      this.submitting() ||
      this.foodstuff() === null ||
      this.destroyRef.destroyed
    )
      return;
    this.submitting.set(true);
    this.dialogRef.disableClose = true;
    try {
      await this.foodstuffBackendService.patchFoodstuff(this.data.id, updates);
      if (this.destroyRef.destroyed) return;
      this.foodstuffBackendService.notifyFoodstuffsChanged();
      this.dialogRef.close();
      this.snackBarService.open('Zutat aktualisiert');
    } catch (error: unknown) {
      if (this.destroyRef.destroyed) return;
      console.error('failed to patch foodstuff: ', error);
      this.snackBarService.open('Zutat konnte nicht aktualisiert werden');
    } finally {
      this.submitting.set(false);
      this.dialogRef.disableClose = this.busy() || this.initialDisableClose;
    }
  }

  private async fetchFoodstuff(): Promise<void> {
    try {
      const foodstuff = await this.foodstuffBackendService.getFoodstuffById(
        this.data.id,
      );
      if (!this.destroyRef.destroyed) this.foodstuff.set(foodstuff);
    } catch (error: unknown) {
      if (this.destroyRef.destroyed) return;
      this.loadFailed.set(true);
      console.error('failed to fetch foodstuff: ', error);
      this.snackBarService.open('Zutat konnte nicht geladen werden');
    }
  }
}
