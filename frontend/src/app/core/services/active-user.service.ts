import {
  Injectable,
  Signal,
  WritableSignal,
  inject,
  isDevMode,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import type { UserOut } from '../api/generated';
import { SnackBarService } from './snack-bar.service';
import { Router } from '@angular/router';
import { UserBackendService } from './user-backend.service';

export const ACTIVE_USER_STORAGE_KEY: string = 'activeUser';

interface StoredUserSelection {
  id: number;
}

@Injectable({
  providedIn: 'root',
})
export class ActiveUserService {
  private readonly snackBarService = inject(SnackBarService);
  private readonly router = inject(Router);
  private readonly userBackendService = inject(UserBackendService);

  private readonly _activeUser = signal<UserOut | null>(null);
  private readonly _restorationState = signal<'idle' | 'loading' | 'error'>('idle');
  readonly restorationState = this._restorationState.asReadonly();
  private selectedUserId: number | null = null;
  private restorationRequest = 0;

  constructor() {
    const restoredUser: StoredUserSelection | null = this.readStoredUser();
    if (restoredUser !== null) {
      this.selectedUserId = restoredUser.id;
      this.storeSelection(restoredUser);
      void this.restoreActiveUser(restoredUser.id);
    }
  }

  get activeUser(): Signal<UserOut | null> {
    return this._activeUser;
  }

  selectUser(value: UserOut): void {
    if (!this.isStoredSelection(value) || typeof value.username !== 'string') {
      return;
    }

    this.restorationRequest++;
    this.selectedUserId = value.id;
    this._activeUser.set(value);
    this._restorationState.set('idle');
    this.storeUser(value);
    this.snackBarService.open('Als ' + value.username + ' angemeldet');
  }

  //#region Public Methods

  switchUser(): void {
    this.restorationRequest++;
    this.selectedUserId = null;
    this._activeUser.set(null);
    this._restorationState.set('idle');
    this.clearStoredUser();
    this.router.navigate(['/userSelection']);
  }

  //#endregion

  //#endregion Utilities

  retryRestoration(): void {
    if (this._restorationState() === 'error' && this.selectedUserId !== null) {
      void this.restoreActiveUser(this.selectedUserId);
    }
  }

  private async restoreActiveUser(userId: number): Promise<void> {
    const request = ++this.restorationRequest;
    this._restorationState.set('loading');
    try {
      const user: UserOut = await this.userBackendService.getUserById(userId);
      if (request !== this.restorationRequest) return;

      this._activeUser.set(user);
      this._restorationState.set('idle');
    } catch (error: unknown) {
      if (request !== this.restorationRequest) return;

      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.selectedUserId = null;
        this.clearStoredUser();
        this._restorationState.set('idle');
        return;
      }

      this._restorationState.set('error');
      if (isDevMode()) {
        console.warn('failed to restore selected user: ', error);
      }
    }
  }

  private readStoredUser(): StoredUserSelection | null {
    const storage: Storage | null = this.getStorage();
    if (storage === null) {
      return null;
    }

    try {
      const user: StoredUserSelection | null = this.parseUser(storage.getItem(ACTIVE_USER_STORAGE_KEY));
      if (user === null) {
        storage.removeItem(ACTIVE_USER_STORAGE_KEY);
      }
      return user;
    } catch {
      return null;
    }
  }

  private storeUser(user: UserOut): void {
    this.storeSelection({ id: user.id });
  }

  private storeSelection(selection: StoredUserSelection): void {
    const storage: Storage | null = this.getStorage();
    if (storage === null) {
      return;
    }

    try {
      storage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify({ id: selection.id }));
    } catch {
      return;
    }
  }

  private clearStoredUser(): void {
    const storage: Storage | null = this.getStorage();
    if (storage === null) {
      return;
    }

    try {
      storage.removeItem(ACTIVE_USER_STORAGE_KEY);
    } catch {
      return;
    }
  }

  private getStorage(): Storage | null {
    try {
      return localStorage;
    } catch {
      return null;
    }
  }

  private parseUser(rawUser: string | null): StoredUserSelection | null {
    if (rawUser === null || rawUser === '') {
      return null;
    }

    try {
      const parsedUser: unknown = JSON.parse(rawUser);
      if (!this.isStoredSelection(parsedUser)) {
        return null;
      }
      return parsedUser;
    } catch {
      return null;
    }
  }

  private isStoredSelection(value: unknown): value is StoredUserSelection {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate: Record<string, unknown> = value as Record<string, unknown>;
    return (
      typeof candidate['id'] === 'number' &&
      Number.isSafeInteger(candidate['id']) &&
      candidate['id'] > 0
    );
  }

  //#endregion
}
