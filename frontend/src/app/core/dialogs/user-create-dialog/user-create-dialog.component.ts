import { Component, inject } from '@angular/core';
import { DialogHeaderComponent } from '../../components/dialog-header/dialog-header.component';
import { MatDialogRef } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { UserCreate, UserOut } from '../../api/generated';
import { UserBackendService } from '../../services/user-backend.service';
import { SnackBarService } from '../../services/snack-bar.service';

@Component({
  selector: 'app-user-create-dialog',
  imports: [
    DialogHeaderComponent,
    MatDialogModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './user-create-dialog.component.html',
  styleUrl: './user-create-dialog.component.scss',
})
export class UserCreateDialogComponent {
  readonly dialogRef = inject<MatDialogRef<UserCreateDialogComponent, UserOut>>(
    MatDialogRef
  );
  readonly userBackendService = inject(UserBackendService);
  readonly snackBarService = inject(SnackBarService);
  readonly fb = inject(FormBuilder);

  userForm = this.fb.nonNullable.group({
    username: ['', Validators.required],
  });

  async onSubmit(): Promise<void> {
    const user: UserCreate = this.userForm.getRawValue();

    try {
      const createdUser: UserOut = await this.userBackendService.postUser(user);
      this.snackBarService.open('Benutzer erstellt');
      this.userBackendService.notifyUsersChanged();
      this.dialogRef.close(createdUser);
    } catch (error: unknown) {
      console.error('failed to create user: ', error);
      this.snackBarService.open('Benutzer konnte nicht erstellt werden');
    }
  }
}
