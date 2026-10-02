import type { Mock } from "vitest";
import { MatDialogRef } from '@angular/material/dialog';
import { signal } from '@angular/core';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { backendUrl } from '../../../core/constants/api';
import { Router } from '@angular/router';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import type { RecipeVersionWrite } from '../../../core/api/generated';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipeCreateDialogComponent } from './recipe-create-dialog.component';

describe('RecipeCreateDialogComponent', () => {
    const recipeVersion: RecipeVersionWrite = {
        name: 'Linsensuppe',
        servings: 2,
        preptime: null,
        ingredients: [],
        steps: [],
    };

    let component: RecipeCreateDialogComponent;
    let createRecipe: Mock;
    let notifyRecipesChanged: Mock;
    let navigate: Mock;
    let close: Mock;
    let openSnackBar: Mock;

    beforeEach(() => {
        createRecipe = vi.fn().mockName('createRecipe').mockResolvedValue({ recipeLineageId: '00000000-0000-4000-8000-000000000007' });
        notifyRecipesChanged = vi.fn().mockName('notifyRecipesChanged');
        navigate = vi.fn().mockName('navigate').mockResolvedValue(true);
        close = vi.fn().mockName('close');
        openSnackBar = vi.fn().mockName('open');
        component = Object.create(RecipeCreateDialogComponent.prototype) as RecipeCreateDialogComponent;
        Object.assign(component, {
            recipeBackendService: {
                createRecipe,
                notifyRecipesChanged,
            } as unknown as RecipeBackendService,
            router: { navigate } as unknown as Router,
            dialogRef: { close } as unknown as MatDialogRef<RecipeCreateDialogComponent>,
            snackBarService: { open: openSnackBar } as unknown as SnackBarService,
            isSubmitting: signal(false),
        });
    });

    it('keeps creation successful when post-success navigation fails', async () => {
        const error = new Error('navigation failed');
        navigate.mockRejectedValue(error);
        const logError = vi.spyOn(console, 'error').mockReturnValue(undefined);

        await component.onSubmit({ recipeVersion, action: 'publish' });
        await Promise.resolve();

        expect(createRecipe).toHaveBeenCalledWith(recipeVersion);
        expect(notifyRecipesChanged).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith(['recipes/', '00000000-0000-4000-8000-000000000007']);
        expect(openSnackBar).toHaveBeenCalledTimes(1);
        expect(openSnackBar).toHaveBeenCalledWith('Rezept erstellt');
        expect(logError).toHaveBeenCalledWith('failed to navigate to created recipe: ', error);
    });

    it('keeps the editor open when a successful response cannot confirm creation', async () => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        const service = TestBed.inject(RecipeBackendService);
        const notify = vi.spyOn(service, 'notifyRecipesChanged');
        const http = TestBed.inject(HttpTestingController);
        Object.assign(component, { recipeBackendService: service });
        vi.spyOn(console, 'error').mockReturnValue(undefined);

        const operation = component.onSubmit({ recipeVersion, action: 'publish' });
        const request = http.expectOne(backendUrl + '/recipes');
        expect(request.request.body).toEqual(recipeVersion);
        request.flush({ recipeLineageId: '00000000-0000-4000-8000-000000000007' }, { status: 201, statusText: 'Created' });
        await operation;

        expect(close).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
        expect(component.isSubmitting()).toBe(false);
        expect(openSnackBar).toHaveBeenCalledTimes(1);
        expect(openSnackBar.mock.lastCall![0]).toContain('Möglicherweise wurde das Rezept bereits erstellt');
        http.expectNone(backendUrl + '/recipes');
        http.verify();
    });

    it.each([0, 408, 503, 422])('distinguishes unconfirmed creation from rejection %s', async status => {
        createRecipe.mockRejectedValue(new HttpErrorResponse({ status }));
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        await component.onSubmit({ recipeVersion, action: 'publish' });
        expect(createRecipe).toHaveBeenCalledTimes(1);
        expect(close).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(notifyRecipesChanged).not.toHaveBeenCalled();
        expect(component.isSubmitting()).toBe(false);
        if (status === 422) expect(openSnackBar).toHaveBeenCalledWith('Rezept konnte nicht erstellt werden');
        else expect(openSnackBar.mock.lastCall![0]).toContain('nicht bestätigt');
    });
});
