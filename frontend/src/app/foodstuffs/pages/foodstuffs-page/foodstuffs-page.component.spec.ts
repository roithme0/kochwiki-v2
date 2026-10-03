import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { RecipeBackendService } from '../../../recipes/services/recipe-backend.service';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { FoodstuffsPageComponent } from './foodstuffs-page.component';
import { FoodstuffUnit } from '../../models/foodstuff-unit';

const foodstuff = (id: number, name: string) => ({
    id,
    name,
    brand: null,
    unit: FoodstuffUnit.Gram,
    unitVerbose: 'Gramm',
    kcal: null,
    carbs: null,
    protein: null,
    fat: null,
    recipeVersionIds: [],
});

interface Deferred<T> {
    promise: Promise<T>;
    reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((_, rejectPromise) => {
        reject = rejectPromise;
    });
    return { promise, reject };
}

describe('FoodstuffsPageComponent', () => {
    let foodstuffsChanged$: Subject<void>;
    let recipesChanged$: Subject<void>;
    const getAllFoodstuffs = vi.fn().mockName('getAllFoodstuffs');
    const snackBarOpen = vi.fn().mockName('open');

    beforeEach(() => {
        foodstuffsChanged$ = new Subject<void>();
        recipesChanged$ = new Subject<void>();
        getAllFoodstuffs.mockClear();
        snackBarOpen.mockClear();
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: FoodstuffBackendService,
                    useValue: { foodstuffsChanged$, getAllFoodstuffs },
                },
                { provide: RecipeBackendService, useValue: { recipesChanged$ } },
                { provide: PageHeaderService, useValue: { updateHeader: () => { } } },
                { provide: SnackBarService, useValue: { open: snackBarOpen } },
            ],
        });
    });

    it('loads foodstuffs initially and after foodstuff or recipe changes', async () => {
        getAllFoodstuffs.mockReturnValueOnce(Promise.resolve([foodstuff(1, 'Linsen')])).mockReturnValueOnce(Promise.resolve([foodstuff(2, 'Bohnen')])).mockReturnValueOnce(Promise.resolve([foodstuff(3, 'Hafer')]));
        const component = TestBed.runInInjectionContext(() => new FoodstuffsPageComponent());

        component.ngOnInit();
        foodstuffsChanged$.next();
        recipesChanged$.next();
        await Promise.resolve();

        expect(getAllFoodstuffs).toHaveBeenCalledTimes(3);
        expect(component.foodstuffsState()).toEqual({
            status: 'success',
            data: [foodstuff(3, 'Hafer')],
        });
    });

    it('retains loaded foodstuffs and reports a refresh error', async () => {
        const loadedFoodstuffs = [foodstuff(1, 'Linsen')];
        getAllFoodstuffs.mockReturnValueOnce(Promise.resolve(loadedFoodstuffs)).mockReturnValueOnce(Promise.reject(new Error('request failed')));
        const component = TestBed.runInInjectionContext(() => new FoodstuffsPageComponent());

        component.ngOnInit();
        await Promise.resolve();
        foodstuffsChanged$.next();
        await Promise.resolve();

        expect(component.foodstuffsState()).toEqual({
            status: 'error',
            data: loadedFoodstuffs,
        });
        expect(snackBarOpen).toHaveBeenCalledTimes(1);
        expect(snackBarOpen).toHaveBeenCalledWith('Zutaten konnten nicht geladen werden');
    });

    it('ignores a late request failure after destruction', async () => {
        const deferred = createDeferred<ReturnType<typeof foodstuff>[]>();
        getAllFoodstuffs.mockReturnValue(deferred.promise);
        const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
        const component = runInInjectionContext(injector, () => new FoodstuffsPageComponent());

        component.ngOnInit();
        injector.destroy();
        deferred.reject(new Error('request failed'));
        await Promise.resolve();

        expect(component.foodstuffsState()).toEqual({ status: 'loading', data: [] });
        expect(snackBarOpen).not.toHaveBeenCalled();
    });
});
