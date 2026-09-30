import { Component, DestroyRef, WritableSignal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderService } from '../../services/page-header.service';
import { UserBackendService } from '../../services/user-backend.service';
import { ActiveUserService } from '../../services/active-user.service';
import { SnackBarService } from '../../services/snack-bar.service';
import { UserCreateDialogComponent } from '../../dialogs/user-create-dialog/user-create-dialog.component';
import type { UserOut } from '../../api/generated';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';

@Component({
  selector: 'app-select-user-page',
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './select-user-page.component.html',
  styleUrl: './select-user-page.component.scss',
})
export class SelectUserPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly pageHeaderService = inject(PageHeaderService);
  readonly userBackendService = inject(UserBackendService);
  readonly activeUserService = inject(ActiveUserService);
  readonly snackBarService = inject(SnackBarService);
  readonly dialog = inject(MatDialog);
  readonly router = inject(Router);

  isLoading: WritableSignal<boolean> = signal(false);
  hasError: WritableSignal<boolean> = signal(false);

  users: WritableSignal<UserOut[]> = signal([]);

  ngOnInit(): void {
    this.pageHeaderService.updateHeader(false, 'Benutzer auswählen', '', false);
    void this.fetchUsers();
    this.keepUsersUpToDate();
  }

  //#region Event Handlers

  onUserSelected(selectedUser: UserOut | undefined): void {
    if (selectedUser === undefined) {
      return;
    }

    this.activeUserService.selectUser(selectedUser);
    this.router.navigate(['']);
  }

  //#endregion

  //#region Public Methods

  openUserCreateDialog(): void {
    const dialogRef: MatDialogRef<
      UserCreateDialogComponent,
      UserOut | undefined
    > = this.dialog.open<UserCreateDialogComponent, unknown, UserOut | undefined>(
        UserCreateDialogComponent,
        {
          minWidth: 'calc(100vw - 1rem)',
          maxWidth: 'calc(100vw - 1rem)',
          maxHeight: 'calc(100vh - 1rem)',
          position: { top: '0.5rem', left: '0.5rem' },
          autoFocus: 'input[formControlName="username"]',
          disableClose: true,
        }
      );

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((createdUser: UserOut | undefined) => {
        if (createdUser === undefined) {
          return;
        }

        this.onUserSelected(createdUser);
      });
  }

  //#endregion

  //#endregion Utilities

  private keepUsersUpToDate(): void {
    this.userBackendService.usersChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.fetchUsers());
  }

  async fetchUsers(): Promise<void> {
    this.isLoading.set(true);
    this.hasError.set(false);

    try {
      this.users.set(structuredClone(await this.userBackendService.getAllUsers()));
    } catch (error: unknown) {
      console.error('failed to fetch users: ', error);
      this.hasError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  //#endregion
}
