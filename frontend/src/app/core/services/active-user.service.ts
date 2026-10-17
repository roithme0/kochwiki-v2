import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { UserOut } from '../api/generated';
import { zUserOut } from '../api/generated/zod.gen';
import { requestApiResponse } from '../api/request-api-response';
import { backendUrl } from '../constants/api';

@Injectable({ providedIn: 'root' })
export class ActiveUserService {
  private readonly http = inject(HttpClient);

  private readonly user = signal<UserOut | null>(null);
  readonly activeUser = this.user.asReadonly();
  private readonly state = signal<
    'uninitialized' | 'idle' | 'loading' | 'error' | 'signed-out'
  >('uninitialized');
  readonly restorationState = this.state.asReadonly();
  readonly logoutPending = signal(false);
  readonly logoutError = signal(false);
  private requestEpoch = 0;
  private sessionCheck: Promise<void> | null = null;

  ensureSession(): Promise<void> {
    if (this.state() === 'uninitialized') {
      this.state.set('loading');
      this.sessionCheck = this.restoreSession();
    }
    return this.state() === 'loading'
      ? (this.sessionCheck ?? Promise.resolve())
      : Promise.resolve();
  }

  async logout(): Promise<boolean> {
    if (this.logoutPending()) return false;
    this.logoutPending.set(true);
    this.logoutError.set(false);
    ++this.requestEpoch;
    try {
      await firstValueFrom(
        this.http.post<void>(`${backendUrl}/auth/logout`, null),
      );
    } catch (error: unknown) {
      if (!(error instanceof HttpErrorResponse && error.status === 401)) {
        this.logoutError.set(true);
        this.logoutPending.set(false);
        return false;
      }
    }
    this.user.set(null);
    this.state.set('signed-out');
    this.logoutPending.set(false);
    return true;
  }

  private async restoreSession(): Promise<void> {
    const epoch = ++this.requestEpoch;
    try {
      const user = await requestApiResponse(
        this.http,
        'GET',
        `${backendUrl}/auth/me`,
        zUserOut,
      );
      if (epoch !== this.requestEpoch) return;
      this.user.set(user);
      this.state.set('idle');
    } catch (error: unknown) {
      if (epoch !== this.requestEpoch) return;
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.state.set('signed-out');
      } else {
        this.state.set('error');
      }
    }
  }
}
