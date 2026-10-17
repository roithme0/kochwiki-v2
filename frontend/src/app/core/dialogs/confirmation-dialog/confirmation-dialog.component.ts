import { Component, inject, signal, WritableSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DialogHeaderComponent } from '../../components/dialog-header/dialog-header.component';

export interface ConfirmationDialogData {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  action: () => Promise<void>;
}

@Component({
  selector: 'app-confirmation-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    DialogHeaderComponent,
  ],
  templateUrl: './confirmation-dialog.component.html',
  styleUrl: './confirmation-dialog.component.scss',
})
export class ConfirmationDialogComponent {
  readonly dialogRef = inject(MatDialogRef<ConfirmationDialogComponent>);
  readonly data = inject<ConfirmationDialogData>(MAT_DIALOG_DATA);
  readonly isExecuting: WritableSignal<boolean> = signal(false);

  async confirm(): Promise<void> {
    if (this.isExecuting()) return;

    this.isExecuting.set(true);
    this.dialogRef.disableClose = true;

    try {
      await this.data.action();
      this.dialogRef.close();
    } catch {
      this.isExecuting.set(false);
      this.dialogRef.disableClose = false;
    }
  }

  cancel(): void {
    if (!this.isExecuting()) this.dialogRef.close();
  }
}
