import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import { Foodstuff } from '../models/foodstuff';
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

  getAllFoodstuffs = (): Promise<Foodstuff[]> =>
    firstValueFrom(this.httpClient.get<Foodstuff[]>(backendUrl + '/foodstuffs'));

  getFoodstuffById = (id: number): Promise<Foodstuff> =>
    firstValueFrom(
      this.httpClient.get<Foodstuff>(backendUrl + '/foodstuffs/' + id)
    );

  patchFoodstuff = (
    id: number,
    updates: Partial<Foodstuff>
  ): Promise<Foodstuff> =>
    firstValueFrom(
      this.httpClient.patch<Foodstuff>(backendUrl + '/foodstuffs/' + id, updates)
    );

  postFoodstuff = (foodstuff: Partial<Foodstuff>): Promise<Foodstuff> =>
    firstValueFrom(
      this.httpClient.post<Foodstuff>(backendUrl + '/foodstuffs', foodstuff)
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
