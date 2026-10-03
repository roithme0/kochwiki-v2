import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import type { FoodstuffCreate, FoodstuffOut, FoodstuffUpdate } from '../../core/api/generated';
import { array } from 'zod/mini';
import { zFoodstuffOut } from '../../core/api/generated/zod.gen';
import { requestApiResponse } from '../../core/api/request-api-response';
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

  getAllFoodstuffs = (): Promise<FoodstuffOut[]> =>
    requestApiResponse(this.httpClient, 'GET', backendUrl + '/foodstuffs', foodstuffListSchema);

  getFoodstuffById = (id: number): Promise<FoodstuffOut> =>
    requestApiResponse(
      this.httpClient, 'GET', `${backendUrl}/foodstuffs/${id}`, zFoodstuffOut
    );

  patchFoodstuff = (
    id: number,
    updates: FoodstuffUpdate
  ): Promise<FoodstuffOut> =>
    requestApiResponse(
      this.httpClient, 'PATCH', `${backendUrl}/foodstuffs/${id}`, zFoodstuffOut,
      { body: updates }
    );

  postFoodstuff = (foodstuff: FoodstuffCreate): Promise<FoodstuffOut> =>
    requestApiResponse(
      this.httpClient, 'POST', backendUrl + '/foodstuffs', zFoodstuffOut,
      { body: foodstuff }
    );

  deleteFoodstuff = (id: number): Promise<void> =>
    firstValueFrom(
      this.httpClient.delete<void>(backendUrl + '/foodstuffs/' + id)
    );

}
