import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import type { UserOut } from '../api/generated';
import { zLogoutOut, zUserOut } from '../api/generated/zod.gen';
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

  async logout(): Promise<string | null> {
    if (this.logoutPending()) return null;
    this.logoutPending.set(true);
    this.logoutError.set(false);
    ++this.requestEpoch;
    let redirectUrl: string;
    try {
      const response = await requestApiResponse(
        this.http,
        'POST',
        `${backendUrl}/auth/logout`,
        zLogoutOut,
      );
      redirectUrl = response.redirect_url;
    } catch {
      this.logoutError.set(true);
      this.logoutPending.set(false);
      return null;
    }
    this.user.set(null);
    this.state.set('signed-out');
    this.logoutPending.set(false);
    return redirectUrl;
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
