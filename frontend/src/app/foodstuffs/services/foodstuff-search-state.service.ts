import { Injectable, Signal, WritableSignal, signal } from '@angular/core';

export const DEFAULT_SEARCH_BY: string = '';

@Injectable({
  providedIn: 'root',
})
export class FoodstuffSearchStateService {
  private _searchBy: WritableSignal<string> = signal(DEFAULT_SEARCH_BY);

  set searchBy(value: string) {
    this._searchBy.set(value);
  }

  get searchBy(): Signal<string> {
    return this._searchBy;
  }

  clearSearch(): void {
    this.searchBy = '';
  }
}
