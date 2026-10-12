import { inject, Injectable } from '@angular/core';
import { CanActivate } from '@angular/router';
import { from, map, Observable } from 'rxjs';
import { ActiveUserService } from '../services/active-user.service';
import { AuthNavigationService } from '../services/auth-navigation.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  readonly activeUserService = inject(ActiveUserService);
  private readonly navigation = inject(AuthNavigationService);

  canActivate(): Observable<boolean> {
    return from(this.activeUserService.ensureSession()).pipe(
      map(() => {
        if (this.activeUserService.activeUser() !== null) return true;
        if (this.activeUserService.restorationState() === 'signed-out')
          this.navigation.signIn();
        return false;
      }),
    );
  }
}
