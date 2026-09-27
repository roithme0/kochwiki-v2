import type { Mock } from "vitest";
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { EMPTY } from 'rxjs';
import { ConfirmationDialogData } from '../../../core/dialogs/confirmation-dialog/confirmation-dialog.component';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipeVersion } from '../../models/recipe';
import { RecipePageComponent } from './recipe-page.component';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { RecipePresentationComponent } from '../../components/recipe-presentation/recipe-presentation.component';

describe('RecipePageComponent', () => {
    let component: RecipePageComponent;
    let openDialog: Mock;
    let deleteRecipeLineage: Mock;
    let publishRecipeDraft: Mock;
    let discardRecipeDraft: Mock;
    let notifyRecipesChanged: Mock;
    let navigate: Mock;
    let openSnackBar: Mock;

    beforeEach(() => {
        openDialog = vi.fn().mockName('open');
    deleteRecipeLineage = vi.fn().mockName('deleteRecipeLineage').mockResolvedValue(undefined);
        publishRecipeDraft = vi.fn().mockName('publishRecipeDraft').mockResolvedValue({});
    discardRecipeDraft = vi.fn().mockName('discardRecipeDraft').mockResolvedValue(undefined);
        notifyRecipesChanged = vi.fn().mockName('notifyRecipesChanged');
        navigate = vi.fn().mockName('navigate').mockResolvedValue(true);
        openSnackBar = vi.fn().mockName('open');

        component = Object.create(RecipePageComponent.prototype) as RecipePageComponent;
        Object.assign(component, {
            recipeLineageId: '00000000-0000-4000-8000-000000000007',
            recipeVersion: draftRecipeVersion,
            dialog: { open: openDialog } as unknown as MatDialog,
            recipeBackendService: {
                deleteRecipeLineage,
                publishRecipeDraft,
                discardRecipeDraft,
                notifyRecipesChanged,
            } as unknown as RecipeBackendService,
            router: { navigate } as unknown as Router,
            snackBarService: { open: openSnackBar } as unknown as SnackBarService,
        });
    });

    it('navigates and notifies after the recipe deletion succeeds', async () => {
        component.openDeleteRecipeDialog();
        const config = vi.mocked(openDialog).mock.lastCall![1] as {
            data: ConfirmationDialogData;
        };

        await config.data.action();

        expect(deleteRecipeLineage).toHaveBeenCalledWith(draftRecipeVersion.recipeLineageId);
        expect(navigate).toHaveBeenCalledWith(['recipes']);
        expect(notifyRecipesChanged).toHaveBeenCalledTimes(1);
        expect(openSnackBar).toHaveBeenCalledWith('Rezeptlinie gelöscht');
    });

    it('shows the existing error snackbar and rejects without navigating after deletion fails', async () => {
        const error = new Error('failed');
        deleteRecipeLineage.mockRejectedValue(error);
        const logError = vi.spyOn(console, 'error').mockReturnValue(undefined);
        component.openDeleteRecipeDialog();
        const config = vi.mocked(openDialog).mock.lastCall![1] as {
            data: ConfirmationDialogData;
        };

        await expect(config.data.action()).rejects.toEqual(error);

        expect(navigate).not.toHaveBeenCalled();
        expect(notifyRecipesChanged).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith('failed to delete recipe lineage: ', error);
        expect(openSnackBar).toHaveBeenCalledWith('Rezept konnte nicht gelöscht werden');
    });

    it('keeps deletion successful when navigation fails after the delete', async () => {
        const error = new Error('navigation failed');
        navigate.mockRejectedValue(error);
        const logError = vi.spyOn(console, 'error').mockReturnValue(undefined);
        component.openDeleteRecipeDialog();
        const config = vi.mocked(openDialog).mock.lastCall![1] as {
            data: ConfirmationDialogData;
        };

        await expect(config.data.action()).resolves.not.toThrow();

        expect(deleteRecipeLineage).toHaveBeenCalledWith(draftRecipeVersion.recipeLineageId);
        expect(notifyRecipesChanged).toHaveBeenCalledTimes(1);
        expect(openSnackBar).toHaveBeenCalledTimes(1);
        expect(openSnackBar).toHaveBeenCalledWith('Rezeptlinie gelöscht');
        expect(logError).toHaveBeenCalledWith('failed to navigate after deleting recipe lineage: ', error);
    });

    it('keeps draft publication successful when navigation fails after publication', async () => {
        const error = new Error('navigation failed');
        navigate.mockRejectedValue(error);
        const logError = vi.spyOn(console, 'error').mockReturnValue(undefined);
        component.openPublishDraftDialog();
        const config = vi.mocked(openDialog).mock.lastCall![1] as {
            data: ConfirmationDialogData;
        };

        await expect(config.data.action()).resolves.not.toThrow();

        expect(publishRecipeDraft).toHaveBeenCalledWith(draftRecipeVersion.recipeLineageId, draftRecipeVersion.recipeVersionId);
        expect(notifyRecipesChanged).toHaveBeenCalledTimes(1);
        expect(openSnackBar).toHaveBeenCalledTimes(1);
        expect(openSnackBar).toHaveBeenCalledWith('Entwurf als aktive Version übernommen');
        expect(logError).toHaveBeenCalledWith('failed to navigate after publishing draft: ', error);
    });

    it('keeps draft discard successful when navigation fails after deletion', async () => {
        const error = new Error('navigation failed');
        navigate.mockRejectedValue(error);
        const logError = vi.spyOn(console, 'error').mockReturnValue(undefined);
        component.openDiscardDraftDialog();
        const config = vi.mocked(openDialog).mock.lastCall![1] as {
            data: ConfirmationDialogData;
        };

        await expect(config.data.action()).resolves.not.toThrow();

        expect(discardRecipeDraft).toHaveBeenCalledWith(draftRecipeVersion.recipeLineageId, draftRecipeVersion.recipeVersionId);
        expect(notifyRecipesChanged).toHaveBeenCalledTimes(1);
        expect(openSnackBar).toHaveBeenCalledTimes(1);
        expect(openSnackBar).toHaveBeenCalledWith('Entwurf verworfen');
        expect(logError).toHaveBeenCalledWith('failed to navigate after discarding draft: ', error);
    });
});

const draftRecipeVersion: RecipeVersion = {
    recipeLineageId: '00000000-0000-4000-8000-000000000007',
    recipeVersionId: '00000000-0000-0000-0000-000000000007',
    state: 'draft',
    createdAt: '2026-09-10T10:00:00Z',
    lastModified: '2026-09-10T10:00:00Z',
    name: 'Draft',
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
};

describe('RecipePageComponent presentation integration', () => {
    it('passes the loaded recipe to the shared presentation', async () => {
        const pageHeader = {
            updateHeader: vi.fn().mockName('updateHeader'),
            set headline(_value: string) { },
        };
        TestBed.configureTestingModule({
            imports: [RecipePageComponent],
            providers: [
                {
                    provide: ActivatedRoute,
                    useValue: {
                        snapshot: {
                            paramMap: convertToParamMap({
                                lineageId: draftRecipeVersion.recipeLineageId,
                            }),
                        },
                    },
                },
                {
                    provide: RecipeBackendService,
                    useValue: {
                        recipesChanged$: EMPTY,
                        getActiveRecipeVersion: vi.fn().mockName('getActiveRecipeVersion').mockResolvedValue(draftRecipeVersion),
                    },
                },
                { provide: PageHeaderService, useValue: pageHeader },
                { provide: SnackBarService, useValue: { open: vi.fn().mockName('open') } },
                { provide: MatDialog, useValue: { open: vi.fn().mockName('open') } },
                { provide: Router, useValue: { navigate: vi.fn().mockName('navigate') } },
            ],
        });
        const fixture = TestBed.createComponent(RecipePageComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const presentation = fixture.debugElement.query(By.directive(RecipePresentationComponent)).componentInstance as RecipePresentationComponent;

        expect(presentation.recipe()).toBe(draftRecipeVersion);
        expect(fixture.nativeElement.querySelector('app-recipe-version-state-badge')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.spacer')).not.toBeNull();
    });
});
