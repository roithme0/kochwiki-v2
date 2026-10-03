import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DialogHeaderComponent } from '../../../core/components/dialog-header/dialog-header.component';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffFormComponent } from '../../components/foodstuff-form/foodstuff-form.component';
import type { FoodstuffCreate } from '../../../core/api/generated';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';

@Component({
  selector: 'app-foodstuff-create-dialog',
  imports: [DialogHeaderComponent, FoodstuffFormComponent, MatDialogModule],
  templateUrl: './foodstuff-create-dialog.component.html',
  styleUrl: './foodstuff-create-dialog.component.scss',
})
export class FoodstuffCreateDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<FoodstuffCreateDialogComponent>);
  private readonly foodstuffBackendService = inject(FoodstuffBackendService);
  private readonly snackBarService = inject(SnackBarService);

  async onSubmit(foodstuff: FoodstuffCreate): Promise<void> {
    try {
      await this.foodstuffBackendService.postFoodstuff(foodstuff);
      this.foodstuffBackendService.notifyFoodstuffsChanged();
      this.dialogRef.close();
      this.snackBarService.open('Lebensmittel erstellt');
    } catch (error: unknown) {
      console.error('failed to create foodstuff: ', error);
      this.snackBarService.open('Lebensmittel konnte nicht erstellt werden');
    }
  }
}
