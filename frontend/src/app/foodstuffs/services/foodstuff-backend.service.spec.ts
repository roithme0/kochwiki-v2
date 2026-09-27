import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FoodstuffBackendService } from './foodstuff-backend.service';
import { Foodstuff } from '../models/foodstuff';
import { FoodstuffUnit } from '../models/foodstuff-unit';
import { backendUrl } from '../../core/constants/api';

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

    it('sends foodstuff updates to the matching patch endpoint', async () => {
        const updates: Partial<Foodstuff> = { name: 'Updated foodstuff' };
        const foodstuff: Foodstuff = {
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
});
