import type { RecipeVersionOut } from '../../../core/api/generated';
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
import { RecipeEditorSubmission } from '../recipe-editor/recipe-editor.component';
import { RecipePatchDialogComponent } from './recipe-patch-dialog.component';

describe('RecipePatchDialogComponent', () => {
    let submission: RecipeEditorSubmission;
    let component: RecipePatchDialogComponent;
    let publishActiveRecipeEdit: Mock;
    let createRecipeDraft: Mock;
    let updateRecipeDraft: Mock;
    let notifyRecipesChanged: Mock;
    let navigate: Mock;
    let close: Mock;
    let openSnackBar: Mock;

    beforeEach(() => {
        submission = { action: 'publish', recipeVersion: recipeVersionWrite };
        publishActiveRecipeEdit = vi.fn().mockName('publishActiveRecipeEdit').mockResolvedValue(activeRecipeVersion);
        createRecipeDraft = vi.fn().mockName('createRecipeDraft').mockResolvedValue(draftRecipeVersion);
        updateRecipeDraft = vi.fn().mockName('updateRecipeDraft').mockResolvedValue(draftRecipeVersion);
        notifyRecipesChanged = vi.fn().mockName('notifyRecipesChanged');
        navigate = vi.fn().mockName('navigate').mockResolvedValue(true);
        close = vi.fn().mockName('close');
        openSnackBar = vi.fn().mockName('open');
        component = Object.create(RecipePatchDialogComponent.prototype) as RecipePatchDialogComponent;
        Object.assign(component, {
            data: { recipeVersion: activeRecipeVersion },
            recipeBackendService: {
                publishActiveRecipeEdit,
                createRecipeDraft,
                updateRecipeDraft,
                notifyRecipesChanged,
            } as unknown as RecipeBackendService,
            router: { navigate } as unknown as Router,
            dialogRef: { close } as unknown as MatDialogRef<RecipePatchDialogComponent>,
            snackBarService: { open: openSnackBar } as unknown as SnackBarService,
            isSubmitting: signal(false),
        });
    });

    it('publishes an active edit directly', async () => {
        await component.onSubmit(submission);

        expect(publishActiveRecipeEdit).toHaveBeenCalledTimes(1);

        expect(publishActiveRecipeEdit).toHaveBeenCalledWith(activeRecipeVersion.recipeLineageId, recipeVersionWrite);
        expect(createRecipeDraft).not.toHaveBeenCalled();
        expect(updateRecipeDraft).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(notifyRecipesChanged).toHaveBeenCalledTimes(1);
    });

    it('creates and opens a draft from an active edit', async () => {
        await component.onSubmit({ action: 'draft', recipeVersion: recipeVersionWrite });

        expect(createRecipeDraft).toHaveBeenCalledTimes(1);

        expect(createRecipeDraft).toHaveBeenCalledWith(activeRecipeVersion.recipeLineageId, recipeVersionWrite);
        expect(publishActiveRecipeEdit).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith(['recipes', draftRecipeVersion.recipeLineageId, 'versions', draftRecipeVersion.recipeVersionId]);
        expect(openSnackBar).toHaveBeenCalledWith('Entwurf gespeichert');
    });

    it('updates a draft even when the editor submission action is publish', async () => {
        Object.assign(component, { data: { recipeVersion: draftRecipeVersion } });

        await component.onSubmit(submission);

        expect(updateRecipeDraft).toHaveBeenCalledTimes(1);

        expect(updateRecipeDraft).toHaveBeenCalledWith(draftRecipeVersion.recipeLineageId, draftRecipeVersion.recipeVersionId, recipeVersionWrite);
        expect(publishActiveRecipeEdit).not.toHaveBeenCalled();
        expect(createRecipeDraft).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(close).toHaveBeenCalledTimes(1);
    });

    it.each(['publish', 'draft', 'update'] as const)('retains the editor after an unconfirmed %s', async action => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        const service = TestBed.inject(RecipeBackendService);
        const notify = vi.spyOn(service, 'notifyRecipesChanged');
        const http = TestBed.inject(HttpTestingController);
        Object.assign(component, { recipeBackendService: service });
        if (action === 'update') Object.assign(component, { data: { recipeVersion: draftRecipeVersion } });
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        const operation = component.onSubmit({ ...submission, action: action === 'draft' ? 'draft' : 'publish' });
        const path = action === 'publish' ? '/publish' : action === 'draft' ? '/drafts' : `/drafts/${draftRecipeVersion.recipeVersionId}`;
        const request = http.expectOne(`${backendUrl}/recipes/${activeRecipeVersion.recipeLineageId}${path}`);
        expect(request.request.body).toEqual(recipeVersionWrite);
        request.flush({ ...draftRecipeVersion, recipeVersionId: 'invalid' });
        await operation;
        expect(close).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
        expect(component.isSubmitting()).toBe(false);
        expect(openSnackBar).toHaveBeenCalledTimes(1);
        expect(openSnackBar.mock.lastCall![0]).toContain('Möglicherweise wurden die Änderungen bereits gespeichert');
        http.verify();
    });

    it.each([404, 409, 422])('preserves definite draft rejection %s without announcing success', async status => {
        Object.assign(component, { data: { recipeVersion: draftRecipeVersion } });
        updateRecipeDraft.mockRejectedValue(new HttpErrorResponse({ status }));
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        await component.onSubmit(submission);
        expect(updateRecipeDraft).toHaveBeenCalledTimes(1);
        expect(close).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(notifyRecipesChanged).not.toHaveBeenCalled();
        expect(component.isSubmitting()).toBe(false);
        expect(openSnackBar).toHaveBeenCalledWith('Entwurf konnte nicht gespeichert werden');
    });
});

const recipeVersionWrite = {
    name: 'Recipe',
    servings: 1,
    preptime: null,
    originName: null,
    originUrl: null,
    ingredients: [],
    steps: [],
} satisfies RecipeVersionWrite;

const activeRecipeVersion: RecipeVersionOut = createRecipeVersion('active', '00000000-0000-0000-0000-000000000001');
const draftRecipeVersion: RecipeVersionOut = createRecipeVersion('draft', '00000000-0000-0000-0000-000000000002');

function createRecipeVersion(state: RecipeVersionOut['state'], recipeVersionId: string): RecipeVersionOut {
    return {
        recipeLineageId: '00000000-0000-4000-8000-000000000001',
        recipeVersionId,
        state,
        createdAt: '2026-09-10T10:00:00Z',
        lastModified: '2026-09-10T10:00:00Z',
        name: recipeVersionWrite.name,
        servings: recipeVersionWrite.servings,
        preptime: recipeVersionWrite.preptime,
        originName: recipeVersionWrite.originName,
        originUrl: recipeVersionWrite.originUrl,
        ingredients: [],
        steps: [],
        kcal: null,
        carbs: null,
        protein: null,
        fat: null,
    };
}
