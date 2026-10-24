import { HttpErrorResponse } from '@angular/common/http';

export function isUnconfirmedRecipeWrite(error: unknown): boolean {
  return !(
    error instanceof HttpErrorResponse &&
    [401, 403, 404, 409, 422].includes(error.status)
  );
}
