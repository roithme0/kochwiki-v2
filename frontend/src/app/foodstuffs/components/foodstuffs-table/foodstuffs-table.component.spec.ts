import type { Mock } from "vitest";
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogData } from '../../../core/dialogs/confirmation-dialog/confirmation-dialog.component';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { Foodstuff } from '../../models/foodstuff';
import { FoodstuffUnit } from '../../models/foodstuff-unit';
import { FoodstuffsTableComponent } from './foodstuffs-table.component';
import { FoodstuffTableDisplayedFieldsService } from '../../services/foodstuff-table-displayed-fields.service';
import { FoodstuffMetadataService } from '../../services/foodstuff-metadata.service';
import { FoodstuffTableControlService } from '../../services/foodstuff-table-control.service';

describe('FoodstuffsTableComponent', () => {
    const foodstuff: Foodstuff = {
        id: 42,
        name: 'Tomate',
        brand: null,
        unit: FoodstuffUnit.Gram,
        unitVerbose: 'Gramm',
        kcal: 18,
        carbs: 3,
        protein: 1,
        fat: 0,
        recipeVersionIds: [],
    };

    let component: FoodstuffsTableComponent;
    let openDialog: Mock;
    let deleteFoodstuff: Mock;
    let notifyFoodstuffsChanged: Mock;
    let openSnackBar: Mock;

    beforeEach(() => {
        openDialog = vi.fn().mockName('open');
        deleteFoodstuff = vi.fn().mockName('deleteFoodstuff');
        notifyFoodstuffsChanged = vi.fn().mockName('notifyFoodstuffsChanged');
        openSnackBar = vi.fn().mockName('open');

        TestBed.configureTestingModule({
            providers: [
                {
                    provide: FoodstuffMetadataService,
                    useValue: { verboseNames: signal(null) },
                },
                { provide: FoodstuffTableDisplayedFieldsService, useValue: {} },
                { provide: FoodstuffTableControlService, useValue: { searchBy: signal('') } },
                { provide: MatDialog, useValue: { open: openDialog } },
                {
                    provide: FoodstuffBackendService,
                    useValue: { deleteFoodstuff, notifyFoodstuffsChanged },
                },
                { provide: SnackBarService, useValue: { open: openSnackBar } },
            ],
        });
        component = TestBed.runInInjectionContext(() => new FoodstuffsTableComponent());
    });

    it('disconnects the resize observer when destroyed', () => {
        const resizeObserver = {
            observe: vi.fn(),
            unobserve: vi.fn(),
            disconnect: vi.fn().mockName("ResizeObserver.disconnect")
        };
        component.tableWrapperResizeObserver = resizeObserver;

        component.ngOnDestroy();

        expect(resizeObserver.disconnect).toHaveBeenCalledTimes(1);

        expect(resizeObserver.disconnect).toHaveBeenCalledWith();
    });

    it('executes the foodstuff deletion and success side effects through the dialog action', async () => {
        deleteFoodstuff.mockResolvedValue(foodstuff.id);

        const action: () => Promise<void> = openConfirmationAction();
        await action();

        expect(deleteFoodstuff).toHaveBeenCalledWith(foodstuff.id);
        expect(notifyFoodstuffsChanged).toHaveBeenCalledTimes(1);
        expect(openSnackBar).toHaveBeenCalledWith('Zutat gelöscht');
    });

    it('shows the existing error snackbar and rejects so the dialog remains open', async () => {
        const error = new Error('failed');
        deleteFoodstuff.mockRejectedValue(error);
        vi.spyOn(console, 'error').mockReturnValue(undefined);

        const action: () => Promise<void> = openConfirmationAction();

        await expect(action()).rejects.toEqual(error);

        expect(notifyFoodstuffsChanged).not.toHaveBeenCalled();
        expect(openSnackBar).toHaveBeenCalledWith('Zutat konnte nicht gelöscht werden');
    });

    function openConfirmationAction(): () => Promise<void> {
        component.openDeleteFoodstuffDialog(foodstuff);
        const config = vi.mocked(openDialog).mock.lastCall![1] as {
            data: ConfirmationDialogData;
        };
        return config.data.action;
    }
});
