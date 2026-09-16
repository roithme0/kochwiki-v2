import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipesPageComponent } from './recipes-page.component';

const recipeVersion = (id: number, name: string) => ({
    recipeLineageId: `00000000-0000-4000-8000-00000000000${id}`,
    recipeVersionId: `00000000-0000-0000-0000-00000000000${id}`,
    state: 'active' as const,
    createdAt: '2026-09-10T10:00:00Z',
    lastModified: '2026-09-10T10:00:00Z',
    name,
    servings: 1,
    preptime: null,
    originName: null,
    originUrl: null,
    kcal: null,
    carbs: null,
    protein: null,
    fat: null,
    ingredients: [],
    steps: [],
});

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

describe('RecipesPageComponent', () => {
    let recipesChanged$: Subject<void>;
    const getAllRecipeVersions = vi.fn().mockName('getAllRecipeVersions');
    const snackBarOpen = vi.fn().mockName('open');

    beforeEach(() => {
        recipesChanged$ = new Subject<void>();
        getAllRecipeVersions.mockClear();
        snackBarOpen.mockClear();
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: RecipeBackendService,
                    useValue: { recipesChanged$, getAllRecipeVersions },
                },
                { provide: PageHeaderService, useValue: { updateHeader: () => { } } },
                { provide: SnackBarService, useValue: { open: snackBarOpen } },
                { provide: MatDialog, useValue: { open: () => { } } },
            ],
        });
    });

    it('loads recipes initially and after recipe changes', async () => {
        getAllRecipeVersions.mockReturnValueOnce(Promise.resolve([recipeVersion(1, 'Suppe')])).mockReturnValueOnce(Promise.resolve([recipeVersion(2, 'Salat')]));
        const component = TestBed.runInInjectionContext(() => new RecipesPageComponent());

        component.ngOnInit();
        recipesChanged$.next();
        await Promise.resolve();

        expect(getAllRecipeVersions).toHaveBeenCalledTimes(2);
        expect(component.recipeVersionsState()).toEqual({
            status: 'success',
            data: [recipeVersion(2, 'Salat')],
        });
    });

    it('retains loaded recipes and reports a refresh error', async () => {
        const loadedRecipeVersions = [recipeVersion(1, 'Suppe')];
        getAllRecipeVersions.mockReturnValueOnce(Promise.resolve(loadedRecipeVersions)).mockReturnValueOnce(Promise.reject(new Error('request failed')));
        const component = TestBed.runInInjectionContext(() => new RecipesPageComponent());

        component.ngOnInit();
        await Promise.resolve();
        recipesChanged$.next();
        await Promise.resolve();

        expect(component.recipeVersionsState()).toEqual({
            status: 'error',
            data: loadedRecipeVersions,
        });
        expect(snackBarOpen).toHaveBeenCalledTimes(1);
        expect(snackBarOpen).toHaveBeenCalledWith('Rezepte konnten nicht geladen werden');
    });

    it('ignores a late request success after destruction', async () => {
        const deferred = createDeferred<ReturnType<typeof recipeVersion>[]>();
        getAllRecipeVersions.mockReturnValue(deferred.promise);
        const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
        const component = runInInjectionContext(injector, () => new RecipesPageComponent());

        component.ngOnInit();
        injector.destroy();
        deferred.resolve([recipeVersion(1, 'Suppe')]);
        await Promise.resolve();

        expect(component.recipeVersionsState()).toEqual({ status: 'loading', data: [] });
        expect(snackBarOpen).not.toHaveBeenCalled();
    });
});
