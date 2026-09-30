import { inject, Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import type { UrlTree } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, Observable, take } from 'rxjs';
import { ActiveUserService } from '../services/active-user.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  readonly activeUserService = inject(ActiveUserService);
  readonly router = inject(Router);
  private readonly restorationState = toObservable(this.activeUserService.restorationState);

  canActivate(): Observable<boolean | UrlTree> {
    return this.restorationState.pipe(
      filter((state) => state === 'idle'),
      take(1),
      map(() => this.activeUserService.activeUser() !== null
        ? true : this.router.createUrlTree(['/userSelection']))
    );
  }
}
