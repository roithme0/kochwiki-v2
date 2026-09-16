import type { Mock } from "vitest";
import { MatDialogRef } from '@angular/material/dialog';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { RecipeVersion, RecipeVersionWrite } from '../../models/recipe';
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
});

const recipeVersionWrite: RecipeVersionWrite = {
    name: 'Recipe',
    servings: 1,
    preptime: null,
    originName: null,
    originUrl: null,
    ingredients: [],
    steps: [],
};

const activeRecipeVersion: RecipeVersion = createRecipeVersion('active', '00000000-0000-0000-0000-000000000001');
const draftRecipeVersion: RecipeVersion = createRecipeVersion('draft', '00000000-0000-0000-0000-000000000002');

function createRecipeVersion(state: RecipeVersion['state'], recipeVersionId: string): RecipeVersion {
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
