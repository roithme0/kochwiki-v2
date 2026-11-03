import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { ActiveUserService } from './active-user.service';

@Injectable({ providedIn: 'root' })
export class AuthNavigationService {
  private readonly document = inject(DOCUMENT);
  private readonly activeUser = inject(ActiveUserService);

  private readonly pending = signal(false);
  readonly redirecting = this.pending.asReadonly();

  signIn(): void {
    if (this.pending()) return;
    this.pending.set(true);
    this.document.location.assign('/api/auth/login');
  }

  async logout(): Promise<void> {
    if (this.pending()) return;
    const redirectUrl = await this.activeUser.logout();
    if (redirectUrl !== null) {
      this.pending.set(true);
      this.document.location.assign(redirectUrl);
    }
  }
}
