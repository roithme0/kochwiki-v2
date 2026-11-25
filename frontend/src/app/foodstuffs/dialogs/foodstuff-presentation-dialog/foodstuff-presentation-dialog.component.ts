import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
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

  readonly foodstuff = signal(this.data.foodstuff);
  readonly actions: FloatingAction[] = [
    { id: 'edit', label: 'Lebensmittel bearbeiten', icon: 'edit' },
  ];
  private readonly actionHandlers = new Map<string, () => void>([
    ['edit', () => this.edit()],
  ]);
  readonly title = computed(() => {
    return foodstuffTitle(this.foodstuff());
  });

  activateAction(id: string): void {
    this.actionHandlers.get(id)?.();
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
