import { Component, inject } from '@angular/core';

import { FoodstuffCreateDialogComponent } from '../../dialogs/foodstuff-create-dialog/foodstuff-create-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-foodstuffs-table-create-foodstuff',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './foodstuffs-table-create-foodstuff.component.html',
  styleUrl: './foodstuffs-table-create-foodstuff.component.css',
})
export class FoodstuffsTableCreateFoodstuffComponent {
  readonly dialog = inject(MatDialog);

  openCreateFoodstuffDialog(): void {
    this.dialog.open(FoodstuffCreateDialogComponent, {
      minWidth: 'calc(100vw - 1rem)',
      maxWidth: 'calc(100vw - 1rem)',
      maxHeight: 'calc(100vh - 1rem)',
      position: { top: '0.5rem', left: '0.5rem' },
      autoFocus: false,
      disableClose: true,
    });
  }
}
