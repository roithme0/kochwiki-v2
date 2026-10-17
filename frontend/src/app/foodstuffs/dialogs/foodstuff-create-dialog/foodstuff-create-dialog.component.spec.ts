import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import type {
  FoodstuffCreate,
  FoodstuffOut,
} from '../../../core/api/generated';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { FoodstuffCreateDialogComponent } from './foodstuff-create-dialog.component';

describe('FoodstuffCreateDialogComponent', () => {
  const request: FoodstuffCreate = { name: 'Reis', unit: 'G' };
  const created: FoodstuffOut = {
    ...request,
    id: 3,
    brand: null,
    imageId: null,
    unitVerbose: 'g',
    kcal: null,
    carbs: null,
    protein: null,
    fat: null,
    recipeVersionIds: [],
  };
  const postFoodstuff = vi.fn();
  const notifyFoodstuffsChanged = vi.fn();
  const close = vi.fn();
  const open = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: FoodstuffBackendService,
          useValue: { postFoodstuff, notifyFoodstuffsChanged },
        },
        { provide: SnackBarService, useValue: { open } },
      ],
    });
  });

  it('returns the persisted record and notifies catalogue consumers only after success', async () => {
    postFoodstuff.mockResolvedValue(created);
    const component = TestBed.createComponent(
      FoodstuffCreateDialogComponent,
    ).componentInstance;
    await component.onSubmit(request);
    expect(postFoodstuff).toHaveBeenCalledExactlyOnceWith(request);
    expect(notifyFoodstuffsChanged).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledExactlyOnceWith(created);
  });

  it('keeps the dialog open and does not notify consumers when creation fails', async () => {
    postFoodstuff.mockRejectedValue(new Error('unavailable'));
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const component = TestBed.createComponent(
        FoodstuffCreateDialogComponent,
      ).componentInstance;
      await component.onSubmit(request);
      expect(close).not.toHaveBeenCalled();
      expect(notifyFoodstuffsChanged).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  });
});
