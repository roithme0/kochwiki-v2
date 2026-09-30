import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import type { FoodstuffCreate, FoodstuffOut, FoodstuffUpdate } from '../../core/api/generated';
import { array } from 'zod/mini';
import { zFoodstuffOut } from '../../core/api/generated/zod.gen';
import { parseApiResponse } from '../../core/api/api-contract-error';
import {
  FoodstuffVerboseNames,
  FoodstuffUnitChoices,
} from '../models/foodstuff-meta-data';
import { backendUrl } from '../../core/constants/api';

const foodstuffListSchema = array(zFoodstuffOut);

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

  getAllFoodstuffs = async (): Promise<FoodstuffOut[]> => {
    const body = await firstValueFrom(this.httpClient.get<unknown>(backendUrl + '/foodstuffs'));
    return parseApiResponse(foodstuffListSchema, body, 'GET /foodstuffs');
  };

  getFoodstuffById = async (id: number): Promise<FoodstuffOut> => {
    const body = await firstValueFrom(
      this.httpClient.get<unknown>(backendUrl + '/foodstuffs/' + id)
    );
    return parseApiResponse(zFoodstuffOut, body, `GET /foodstuffs/${id}`);
  };

  patchFoodstuff = async (
    id: number,
    updates: FoodstuffUpdate
  ): Promise<FoodstuffOut> => {
    const body = await firstValueFrom(
      this.httpClient.patch<unknown>(backendUrl + '/foodstuffs/' + id, updates)
    );
    return parseApiResponse(zFoodstuffOut, body, `PATCH /foodstuffs/${id}`);
  };

  postFoodstuff = async (foodstuff: FoodstuffCreate): Promise<FoodstuffOut> => {
    const body = await firstValueFrom(
      this.httpClient.post<unknown>(backendUrl + '/foodstuffs', foodstuff)
    );
    return parseApiResponse(zFoodstuffOut, body, 'POST /foodstuffs');
  };

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
