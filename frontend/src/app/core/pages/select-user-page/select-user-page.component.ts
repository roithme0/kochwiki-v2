import { Component, WritableSignal, inject, signal } from '@angular/core';
import { PageHeaderService } from '../../services/page-header.service';
import { UserBackendService } from '../../services/user-backend.service';
import { ActiveUserService } from '../../services/active-user.service';
import type { UserOut } from '../../api/generated';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';

@Component({
  selector: 'app-select-user-page',
  imports: [MatCardModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './select-user-page.component.html',
  styleUrl: './select-user-page.component.scss',
})
export class SelectUserPageComponent {
  readonly pageHeaderService = inject(PageHeaderService);
  readonly userBackendService = inject(UserBackendService);
  readonly activeUserService = inject(ActiveUserService);
  readonly router = inject(Router);

  isLoading: WritableSignal<boolean> = signal(false);
  hasError: WritableSignal<boolean> = signal(false);

  users: WritableSignal<UserOut[]> = signal([]);

  ngOnInit(): void {
    this.pageHeaderService.updateHeader(false, 'Benutzer auswählen', '', false);
    void this.fetchUsers();
  }

  onUserSelected(selectedUser: UserOut | undefined): void {
    if (selectedUser === undefined) {
      return;
    }

    this.activeUserService.selectUser(selectedUser);
    this.router.navigate(['']);
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
}
