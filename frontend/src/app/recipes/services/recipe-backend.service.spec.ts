import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { RecipeVersionOut, RecipeVersionWrite } from '../../core/api/generated';
import { ApiContractError } from '../../core/api/api-contract-error';
import { backendUrl } from '../../core/constants/api';
import { RecipeBackendService } from './recipe-backend.service';

const lineageId = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';
const recipe: RecipeVersionOut = {
  recipeLineageId: lineageId, recipeVersionId: versionId, state: 'active',
  createdAt: '2026-09-30T10:00:00Z', lastModified: '2026-09-30T10:00:00Z',
  name: 'Oats', servings: 2, preptime: null, originName: null, originUrl: null,
  kcal: 46.25, carbs: 7.5, protein: null, fat: null,
  ingredients: [{ id: 1, index: 1, amount: 12.5, recipeVersionId: versionId,
    foodstuff: { id: 1, name: 'Oats', brand: null, unit: 'G', unitVerbose: 'g',
      kcal: 370, carbs: 60, protein: null, fat: null } }],
  steps: [{ id: 1, index: 1, description: 'Cook', recipeVersionId: versionId }],
};
const write: RecipeVersionWrite = {
  name: recipe.name, servings: recipe.servings, preptime: null, originName: null, originUrl: null,
  ingredients: [{ index: 1, amount: 12.5, foodstuffId: 1 }],
  steps: [{ index: 1, description: 'Cook' }],
};
const operations: {
  method?: 'POST' | 'PUT';
  body?: RecipeVersionWrite | Record<string, never>;
  path: string;
  list: boolean;
  run: (service: RecipeBackendService) => Promise<RecipeVersionOut | RecipeVersionOut[]>;
}[] = [
  { path: '/recipes', list: true, run: (service) => service.getAllRecipeVersions() },
  { path: `/recipes/${lineageId}`, list: false, run: (service) => service.getActiveRecipeVersion(lineageId) },
  { path: `/recipes/${lineageId}/versions/${versionId}`, list: false,
    run: (service) => service.getRecipeVersion(lineageId, versionId) },
  { method: 'POST', path: '/recipes', body: write, list: false,
    run: (service) => service.createRecipe(write) },
  { method: 'POST', path: `/recipes/${lineageId}/publish`, body: write, list: false,
    run: (service) => service.publishActiveRecipeEdit(lineageId, write) },
  { method: 'POST', path: `/recipes/${lineageId}/drafts`, body: write, list: false,
    run: (service) => service.createRecipeDraft(lineageId, write) },
  { method: 'PUT', path: `/recipes/${lineageId}/drafts/${versionId}`, body: write, list: false,
    run: (service) => service.updateRecipeDraft(lineageId, versionId, write) },
  { method: 'POST', path: `/recipes/${lineageId}/drafts/${versionId}/publish`, body: {}, list: false,
    run: (service) => service.publishRecipeDraft(lineageId, versionId) },
];
const { name: _name, ...missingName } = recipe;
const malformedResponses = [
  { reason: 'missing field', body: missingName },
  { reason: 'null name', body: { ...recipe, name: null } },
  { reason: 'invalid UUID', body: { ...recipe, recipeVersionId: 'version' } },
  { reason: 'invalid state', body: { ...recipe, state: 'unknown' } },
  { reason: 'invalid timestamp', body: { ...recipe, createdAt: 'yesterday' } },
  { reason: 'string nutrient', body: { ...recipe, kcal: '46.25' } },
  { reason: 'string ingredient amount', body: { ...recipe, ingredients: [{ ...recipe.ingredients[0], amount: '12.5' }] } },
  { reason: 'invalid nested UUID', body: { ...recipe, steps: [{ ...recipe.steps[0], recipeVersionId: 'version' }] } },
  { reason: 'missing step description', body: { ...recipe, steps: [{ id: 1, index: 1, recipeVersionId: versionId }] } },
  { reason: 'invalid foodstuff unit', body: { ...recipe, ingredients: [{ ...recipe.ingredients[0],
    foodstuff: { ...recipe.ingredients[0].foodstuff, unit: 'unknown' } }] } },
  { reason: 'extra recipe field', body: { ...recipe, unexpected: true } },
  { reason: 'extra ingredient field', body: { ...recipe, ingredients: [{ ...recipe.ingredients[0], unexpected: true }] } },
  { reason: 'extra step field', body: { ...recipe, steps: [{ ...recipe.steps[0], unexpected: true }] } },
  { reason: 'extra foodstuff field', body: { ...recipe, ingredients: [{ ...recipe.ingredients[0],
    foodstuff: { ...recipe.ingredients[0].foodstuff, unexpected: true } }] } },
];

describe('RecipeBackendService JSON responses', () => {
  let service: RecipeBackendService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RecipeBackendService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  describe.each(operations)('$method $path', (operation) => {
    it('accepts decimals, nullable fields and nested response data', async () => {
      const response = operation.run(service);
      const request = http.expectOne(backendUrl + operation.path);
      expect(request.request.method).toBe(operation.method ?? 'GET');
      expect(request.request.body).toEqual(operation.body ?? null);
      const body = operation.list ? [recipe] : recipe;
      request.flush(body);
      await expect(response).resolves.toEqual(body);
    });
    it.each(malformedResponses)('rejects $reason before returning a recipe', async ({ body }) => {
      const response = operation.run(service);
      const rejection = expect(response).rejects.toMatchObject({
        name: 'ApiContractError', endpoint: `${operation.method ?? 'GET'} ${backendUrl}${operation.path}`,
        cause: expect.objectContaining({ issues: expect.any(Array) }),
      });
      http.expectOne(backendUrl + operation.path).flush(operation.list ? [recipe, body] : body);
      await rejection;
    });
    it.each([404, 409, 422, 503])('preserves HTTP failure %s and its body', async (status) => {
      const body = { detail: 'Request failed' };
      const response = operation.run(service);
      const rejection = expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
      const details = expect(response).rejects.toMatchObject({ status, error: body });
      http.expectOne(backendUrl + operation.path).flush(body, { status, statusText: 'Failed' });
      await rejection;
      await details;
    });
    it('preserves a connection failure without retrying', async () => {
      const response = operation.run(service);
      const rejection = expect(response).rejects.toMatchObject({ status: 0 });
      http.expectOne(backendUrl + operation.path).error(new ProgressEvent('error'));
      await rejection;
      http.expectNone(backendUrl + operation.path);
    });
  });
  it('accepts an empty list', async () => {
    const response = service.getAllRecipeVersions();
    http.expectOne(backendUrl + '/recipes').flush([]);
    await expect(response).resolves.toEqual([]);
  });
  it('rejects an object instead of a list', async () => {
    const response = service.getAllRecipeVersions();
    const rejection = expect(response).rejects.toBeInstanceOf(ApiContractError);
    http.expectOne(backendUrl + '/recipes').flush(recipe);
    await rejection;
  });
  it('accepts an empty recipe with independently nullable nutrients', async () => {
    const body = { ...recipe, ingredients: [], steps: [], kcal: null, protein: 2.75 };
    const response = service.getActiveRecipeVersion(lineageId);
    http.expectOne(`${backendUrl}/recipes/${lineageId}`).flush(body);
    await expect(response).resolves.toEqual(body);
  });
});
