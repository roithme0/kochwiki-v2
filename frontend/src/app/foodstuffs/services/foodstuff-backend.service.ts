import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import type { FoodstuffCreate, FoodstuffOut, FoodstuffUpdate } from '../../core/api/generated';
import {
  FoodstuffVerboseNames,
  FoodstuffUnitChoices,
} from '../models/foodstuff-meta-data';
import { backendUrl } from '../../core/constants/api';

@Injectable({
  providedIn: 'root',
})
export class FoodstuffBackendService {
  private readonly httpClient = inject(HttpClient);

  private _foodstuffsChanged$ = new Subject<void>();
  foodstuffsChanged$ = this._foodstuffsChanged$.asObservable();

  notifyFoodstuffsChanged(): void {
    this._foodstuffsChanged$.next();
  }

  getAllFoodstuffs = (): Promise<FoodstuffOut[]> =>
    firstValueFrom(this.httpClient.get<FoodstuffOut[]>(backendUrl + '/foodstuffs'));

  getFoodstuffById = (id: number): Promise<FoodstuffOut> =>
    firstValueFrom(
      this.httpClient.get<FoodstuffOut>(backendUrl + '/foodstuffs/' + id)
    );

  patchFoodstuff = (
    id: number,
    updates: FoodstuffUpdate
  ): Promise<FoodstuffOut> =>
    firstValueFrom(
      this.httpClient.patch<FoodstuffOut>(backendUrl + '/foodstuffs/' + id, updates)
    );

  postFoodstuff = (foodstuff: FoodstuffCreate): Promise<FoodstuffOut> =>
    firstValueFrom(
      this.httpClient.post<FoodstuffOut>(backendUrl + '/foodstuffs', foodstuff)
    );

  deleteFoodstuff = (id: number): Promise<void> =>
    firstValueFrom(
      this.httpClient.delete<void>(backendUrl + '/foodstuffs/' + id)
    );

  fetchFoodstuffVerboseNames = (): Promise<FoodstuffVerboseNames> =>
    firstValueFrom(
      this.httpClient.get<FoodstuffVerboseNames>(
        backendUrl + '/foodstuffs-meta-data/verbose-names'
      )
    );

  fetchFoodstuffUnitChoices = (): Promise<FoodstuffUnitChoices> =>
    firstValueFrom(
      this.httpClient.get<FoodstuffUnitChoices>(
        backendUrl + '/foodstuffs-meta-data/unit-choices'
      )
    );
}
