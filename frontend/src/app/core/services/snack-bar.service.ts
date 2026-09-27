import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

export interface SnackBarHandle {
  dismiss(): void;
}

@Injectable({ providedIn: 'root' })
export class SnackBarService {
  private readonly snackBarService = inject(MatSnackBar);

  open(
    text: string,
    action?: { label: string; run: () => void },
  ): SnackBarHandle {
    let dismissed = false;
    let dismissShown: (() => void) | undefined;
    const timer = setTimeout(() => {
      if (dismissed) return;
      const ref = this.snackBarService.open(text, action?.label ?? '', {
        duration: action ? 10000 : 2000,
      });
      dismissShown = () => ref.dismiss();
      if (action)
        ref.onAction().subscribe(() => {
          if (!dismissed) action.run();
        });
    }, 0);
    return {
      dismiss: (): void => {
        dismissed = true;
        clearTimeout(timer);
        dismissShown?.();
      },
    };
  }
}
