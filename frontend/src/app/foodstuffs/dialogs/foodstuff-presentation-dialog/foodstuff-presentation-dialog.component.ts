import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import type {
  FoodstuffOut,
  FoodstuffSummaryOut,
} from '../../../core/api/generated';
import { DialogHeaderComponent } from '../../../core/components/dialog-header/dialog-header.component';
import {
  FloatingAction,
  FloatingActionsComponent,
} from '../../../core/components/floating-actions/floating-actions.component';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '../../../core/dialogs/confirmation-dialog/confirmation-dialog.component';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { foodstuffTitle } from '../../presentation/foodstuff-title';
import { FoodstuffPresentationComponent } from '../../components/foodstuff-presentation/foodstuff-presentation.component';
import { FoodstuffPatchDialogComponent } from '../foodstuff-patch-dialog/foodstuff-patch-dialog.component';

export interface FoodstuffPresentationDialogData {
  foodstuff: FoodstuffSummaryOut;
  editable: boolean;
}

@Component({
  selector: 'app-foodstuff-presentation-dialog',
  imports: [
    DialogHeaderComponent,
    FloatingActionsComponent,
    FoodstuffPresentationComponent,
    MatDialogModule,
  ],
  templateUrl: './foodstuff-presentation-dialog.component.html',
  styleUrl: './foodstuff-presentation-dialog.component.scss',
})
export class FoodstuffPresentationDialogComponent {
  readonly data = inject<FoodstuffPresentationDialogData>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogRef = inject(
    MatDialogRef<FoodstuffPresentationDialogComponent>,
  );
  private readonly backend = inject(FoodstuffBackendService);
  private readonly snackBar = inject(SnackBarService);

  readonly foodstuff = signal<FoodstuffSummaryOut | FoodstuffOut>(
    this.data.foodstuff,
  );
  readonly actions = computed<FloatingAction[]>(() => {
    const foodstuff = this.foodstuff();
    return [
      { id: 'edit', label: 'Lebensmittel bearbeiten', icon: 'edit' },
      {
        id: 'delete',
        label: 'Lebensmittel löschen',
        icon: 'delete',
        disabled:
          !('recipeVersionIds' in foodstuff) ||
          foodstuff.recipeVersionIds.length > 0,
      },
    ];
  });
  private readonly actionHandlers = new Map<string, () => void>([
    ['edit', () => this.edit()],
    ['delete', () => this.delete()],
  ]);
  readonly title = computed(() => {
    return foodstuffTitle(this.foodstuff());
  });

  activateAction(id: string): void {
    this.actionHandlers.get(id)?.();
  }

  private delete(): void {
    if (this.actions().find((action) => action.id === 'delete')?.disabled)
      return;
    const data: ConfirmationDialogData = {
      title: 'Lebensmittel löschen?',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen',
      action: async () => {
        try {
          await this.backend.deleteFoodstuff(this.foodstuff().id);
        } catch (error: unknown) {
          this.snackBar.open('Zutat konnte nicht gelöscht werden');
          throw error;
        }
        this.backend.notifyFoodstuffsChanged();
        this.dialogRef.close();
        this.snackBar.open('Zutat gelöscht');
      },
    };
    this.dialog.open(ConfirmationDialogComponent, {
      data,
      maxWidth: 'min(var(--app-max-width), 100vw)',
      maxHeight: '100dvh',
      autoFocus: false,
    });
  }

  private edit(): void {
    this.dialog
      .open<FoodstuffPatchDialogComponent, { id: number }, FoodstuffOut>(
        FoodstuffPatchDialogComponent,
        {
          data: { id: this.foodstuff().id },
          width: '100vw',
          maxWidth: 'min(var(--app-max-width), 100vw)',
          height: '100dvh',
          maxHeight: '100dvh',
          position: { top: '0' },
          autoFocus: 'first-tabbable',
          disableClose: true,
          restoreFocus: false,
        },
      )
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        if (saved) this.foodstuff.set(saved);
      });
  }
}
