import type { Mock } from "vitest";
import { MatDialogRef } from '@angular/material/dialog';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { RecipeVersionWrite } from '../../models/recipe';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipeCreateDialogComponent } from './recipe-create-dialog.component';

describe('RecipeCreateDialogComponent', () => {
    const recipeVersion: RecipeVersionWrite = {
        name: 'Linsensuppe',
        servings: 2,
        originName: null,
        originUrl: null,
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
});
