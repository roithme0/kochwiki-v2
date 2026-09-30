import type { RecipeVersionOut } from '../../core/api/generated';
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RecipeVersionWrite } from '../models/recipe';
import { firstValueFrom, Subject } from 'rxjs';
import { backendUrl } from '../../core/constants/api';
import { array } from 'zod/mini';
import { zRecipeVersionOut } from '../../core/api/generated/zod.gen';
import { requestApiResponse } from '../../core/api/request-api-response';

@Injectable({
  providedIn: 'root',
})
export class RecipeBackendService {
  private readonly httpClient = inject(HttpClient);

  private _recipesChanged$ = new Subject<void>();
  recipesChanged$ = this._recipesChanged$.asObservable();

  notifyRecipesChanged() {
    this._recipesChanged$.next();
  }

  getAllRecipeVersions = (): Promise<RecipeVersionOut[]> =>
    requestApiResponse(this.httpClient, 'GET', backendUrl + '/recipes', array(zRecipeVersionOut));

  getActiveRecipeVersion = (recipeLineageId: string): Promise<RecipeVersionOut> =>
    requestApiResponse(this.httpClient, 'GET', backendUrl + '/recipes/' + recipeLineageId, zRecipeVersionOut);

  getRecipeVersion = (recipeLineageId: string, recipeVersionId: string): Promise<RecipeVersionOut> =>
    requestApiResponse(
      this.httpClient, 'GET', backendUrl + '/recipes/' + recipeLineageId + '/versions/' + recipeVersionId, zRecipeVersionOut
    );

  createRecipe = (recipeVersion: RecipeVersionWrite): Promise<RecipeVersionOut> =>
    firstValueFrom(this.httpClient.post<RecipeVersionOut>(backendUrl + '/recipes', recipeVersion));

  publishActiveRecipeEdit = (recipeLineageId: string, recipeVersion: RecipeVersionWrite): Promise<RecipeVersionOut> =>
    firstValueFrom(this.httpClient.post<RecipeVersionOut>(backendUrl + '/recipes/' + recipeLineageId + '/publish', recipeVersion));

  createRecipeDraft = (recipeLineageId: string, recipeVersion: RecipeVersionWrite): Promise<RecipeVersionOut> =>
    firstValueFrom(this.httpClient.post<RecipeVersionOut>(backendUrl + '/recipes/' + recipeLineageId + '/drafts', recipeVersion));

  updateRecipeDraft = (recipeLineageId: string, recipeVersionId: string, recipeVersion: RecipeVersionWrite): Promise<RecipeVersionOut> =>
    firstValueFrom(this.httpClient.put<RecipeVersionOut>(backendUrl + '/recipes/' + recipeLineageId + '/drafts/' + recipeVersionId, recipeVersion));

  publishRecipeDraft = (recipeLineageId: string, recipeVersionId: string): Promise<RecipeVersionOut> =>
    firstValueFrom(this.httpClient.post<RecipeVersionOut>(backendUrl + '/recipes/' + recipeLineageId + '/drafts/' + recipeVersionId + '/publish', {}));

  discardRecipeDraft = (recipeLineageId: string, recipeVersionId: string): Promise<void> =>
    firstValueFrom(this.httpClient.delete<void>(backendUrl + '/recipes/' + recipeLineageId + '/drafts/' + recipeVersionId));

  deleteRecipeLineage = (recipeLineageId: string): Promise<void> =>
    firstValueFrom(this.httpClient.delete<void>(backendUrl + '/recipes/' + recipeLineageId));
}
