import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ActiveUserService } from './active-user.service';

@Injectable({ providedIn: 'root' })
export class AuthNavigationService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly activeUser = inject(ActiveUserService);

  private readonly pending = signal(false);
  readonly redirecting = this.pending.asReadonly();

  signIn(): void {
    if (this.pending()) return;
    this.pending.set(true);
    this.document.location.assign('/api/auth/login');
  }

  async logout(): Promise<void> {
    if (await this.activeUser.logout()) {
      await this.router.navigate(['/signed-out']);
    }
  }
}
