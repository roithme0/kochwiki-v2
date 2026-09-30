import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FoodstuffBackendService } from './foodstuff-backend.service';
import type { FoodstuffOut, FoodstuffUpdate, FoodstuffVerboseNames, FoodstuffUnitChoices } from '../../core/api/generated';
import { FoodstuffUnit } from '../models/foodstuff-unit';
import { backendUrl } from '../../core/constants/api';
import { ApiContractError } from '../../core/api/api-contract-error';

const foodstuff: FoodstuffOut = {
    id: 7,
    name: 'Oats',
    brand: null,
    unit: FoodstuffUnit.Gram,
    unitVerbose: 'Gramm',
    kcal: 370.5,
    carbs: 60,
    protein: null,
    fat: 7,
    recipeVersionIds: ['00000000-0000-4000-8000-000000000001'],
};

const operations: {
    method: string;
    path: string;
    list: boolean;
    run: (service: FoodstuffBackendService) => Promise<FoodstuffOut | FoodstuffOut[]>;
}[] = [
    { method: 'GET', path: '/foodstuffs', list: true, run: (service) => service.getAllFoodstuffs() },
    { method: 'GET', path: '/foodstuffs/7', list: false, run: (service) => service.getFoodstuffById(7) },
    { method: 'POST', path: '/foodstuffs', list: false, run: (service) => service.postFoodstuff({ name: 'Oats', unit: 'G' }) },
    { method: 'PATCH', path: '/foodstuffs/7', list: false, run: (service) => service.patchFoodstuff(7, { kcal: 370.5 }) },
];

const malformedResponses = [
    { reason: 'missing nullable field', body: Object.fromEntries(Object.entries(foodstuff).filter(([key]) => key !== 'protein')) },
    { reason: 'string nutrition', body: { ...foodstuff, kcal: '370.5' } },
    { reason: 'null required field', body: { ...foodstuff, name: null } },
    { reason: 'unknown unit', body: { ...foodstuff, unit: 'KG' } },
    { reason: 'invalid recipe UUID', body: { ...foodstuff, recipeVersionIds: ['invalid'] } },
    { reason: 'undocumented field', body: { ...foodstuff, unexpected: true } },
];

const verboseNames: FoodstuffVerboseNames = {
    name: 'Name', brand: 'Marke', unit: 'Einheit', unitVerbose: 'Einheit',
    kcal: 'Kalorien', carbs: 'Kohlenhydrate', protein: 'Proteine', fat: 'Fett',
};
const unitChoices: FoodstuffUnitChoices = { G: 'g', ML: 'ml', PIECE: 'Stk.' };
const metadataOperations = [
    { path: '/foodstuffs-meta-data/verbose-names', body: verboseNames,
        run: (service: FoodstuffBackendService) => service.fetchFoodstuffVerboseNames() },
    { path: '/foodstuffs-meta-data/unit-choices', body: unitChoices,
        run: (service: FoodstuffBackendService) => service.fetchFoodstuffUnitChoices() },
];

describe('FoodstuffBackendService', () => {
    let service: FoodstuffBackendService;
    let httpTesting: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        service = TestBed.inject(FoodstuffBackendService);
        httpTesting = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpTesting.verify();
    });

    describe.each(metadataOperations)('GET $path', ({ path, body, run }) => {
        it('accepts the complete metadata', async () => {
            const response = run(service);
            const request = httpTesting.expectOne(backendUrl + path);
            expect(request.request.method).toBe('GET');
            request.flush(body);
            await expect(response).resolves.toEqual(body);
        });

        it.each(Object.keys(body))('rejects missing required key %s', async (key) => {
            const response = run(service);
            const rejection = expect(response).rejects.toBeInstanceOf(ApiContractError);
            httpTesting.expectOne(backendUrl + path).flush(
                Object.fromEntries(Object.entries(body).filter(([entry]) => entry !== key))
            );
            await rejection;
        });

        it.each([
            { reason: 'unknown key', value: { ...body, unknown: 'Label' } },
            { reason: 'non-string label', value: Object.fromEntries(Object.keys(body).map((key) => [key, 123])) },
            { reason: 'null label', value: Object.fromEntries(Object.keys(body).map((key) => [key, null])) },
            { reason: 'array body', value: [] },
        ])('rejects $reason', async ({ value }) => {
            const response = run(service);
            const request = httpTesting.expectOne(backendUrl + path);
            const endpoint = `${request.request.method} ${request.request.url}`;
            const rejection = expect(response).rejects.toMatchObject({
                name: 'ApiContractError', endpoint,
                message: `Invalid response from ${endpoint}`,
                cause: expect.objectContaining({ issues: expect.any(Array) }),
            });
            request.flush(value);
            await rejection;
        });

        it('preserves HTTP failures', async () => {
            const response = run(service);
            const rejection = expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
            httpTesting.expectOne(backendUrl + path).flush({ detail: 'Unavailable' }, {
                status: 503, statusText: 'Service Unavailable',
            });
            await rejection;
        });
    });

    describe.each(operations)('$method $path', (operation) => {
        it('accepts numeric nutrition, nulls, and recipe UUIDs', async () => {
            const response = operation.run(service);
            const request = httpTesting.expectOne(backendUrl + operation.path);
            expect(request.request.method).toBe(operation.method);
            const body = operation.list ? [foodstuff] : foodstuff;
            request.flush(body);
            await expect(response).resolves.toEqual(body);
        });

        it.each(malformedResponses)('rejects $reason', async ({ body }) => {
            const response = operation.run(service);
            const request = httpTesting.expectOne(backendUrl + operation.path);
            expect(request.request.method).toBe(operation.method);
            const endpoint = `${request.request.method} ${request.request.url}`;
            const rejection = expect(response).rejects.toMatchObject({
                name: 'ApiContractError',
                endpoint,
                message: `Invalid response from ${endpoint}`,
                cause: expect.objectContaining({ issues: expect.any(Array) }),
            });
            request.flush(operation.list ? [foodstuff, body] : body);
            await rejection;
        });
    });

    it('rejects an object where the list endpoint promises an array', async () => {
        const response = service.getAllFoodstuffs();
        const rejection = expect(response).rejects.toBeInstanceOf(ApiContractError);
        httpTesting.expectOne(backendUrl + '/foodstuffs').flush(foodstuff);
        await rejection;
    });

    it('accepts an empty foodstuff list', async () => {
        const response = service.getAllFoodstuffs();
        httpTesting.expectOne(backendUrl + '/foodstuffs').flush([]);
        await expect(response).resolves.toEqual([]);
    });

    it.each([
        { status: 404, statusText: 'Not Found', body: { detail: 'Foodstuff not found' } },
        { status: 409, statusText: 'Conflict', body: { detail: 'Duplicate foodstuff' } },
        { status: 422, statusText: 'Unprocessable Entity', body: { detail: [{ loc: ['body', 'name'], msg: 'Invalid name', type: 'value_error' }] } },
        { status: 0, statusText: 'Unknown Error', body: null },
    ])('preserves HTTP failure $status and its body', async ({ status, statusText, body }) => {
        const response = service.patchFoodstuff(7, { name: 'Oats' });
        const rejection = expect(response).rejects.toBeInstanceOf(HttpErrorResponse);
        const details = expect(response).rejects.toMatchObject({ status, error: body });
        httpTesting.expectOne(backendUrl + '/foodstuffs/7').flush(body, { status, statusText });
        await rejection;
        await details;
    });

    it('sends foodstuff updates to the matching patch endpoint', async () => {
        const updates: FoodstuffUpdate = { name: 'Updated foodstuff' };
        const foodstuff: FoodstuffOut = {
            id: 7,
            name: 'Updated foodstuff',
            brand: null,
            unit: FoodstuffUnit.Gram,
            unitVerbose: 'Gramm',
            kcal: null,
            carbs: null,
            protein: null,
            fat: null,
            recipeVersionIds: [],
        };

        const responsePromise = service.patchFoodstuff(foodstuff.id, updates);

        const request = httpTesting.expectOne(`${backendUrl}/foodstuffs/${foodstuff.id}`);
        expect(request.request.method).toBe('PATCH');
        expect(request.request.body).toEqual(updates);
        request.flush(foodstuff);

        await expect(responsePromise).resolves.toEqual(foodstuff);
    });

    it('accepts a bodyless delete response', async () => {
        const responsePromise: Promise<void> = service.deleteFoodstuff(7);

        const request = httpTesting.expectOne(`${backendUrl}/foodstuffs/7`);
        expect(request.request.method).toBe('DELETE');
        request.flush(null, { status: 204, statusText: 'No Content' });

        await expect(responsePromise).resolves.toBeNull();
    });
});
