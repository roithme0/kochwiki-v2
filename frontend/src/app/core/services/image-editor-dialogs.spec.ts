import {
  Component,
  DebugElement,
  NgZone,
  getDebugNode,
  input,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import type { FoodstuffOut, RecipeVersionOut } from '../api/generated';
import { SnackBarService } from './snack-bar.service';
import { FoodstuffFormComponent } from '../../foodstuffs/components/foodstuff-form/foodstuff-form.component';
import { FoodstuffBackendService } from '../../foodstuffs/services/foodstuff-backend.service';
import { FoodstuffImageService } from '../../foodstuffs/services/foodstuff-image.service';
import { FoodstuffCreateDialogComponent } from '../../foodstuffs/dialogs/foodstuff-create-dialog/foodstuff-create-dialog.component';
import { FoodstuffPatchDialogComponent } from '../../foodstuffs/dialogs/foodstuff-patch-dialog/foodstuff-patch-dialog.component';

import { Router } from '@angular/router';
import { RecipeBackendService } from '../../recipes/services/recipe-backend.service';
import { RecipeImageService } from '../../recipes/services/recipe-image.service';
import { RecipeCreateDialogComponent } from '../../recipes/dialogs/recipe-create-dialog/recipe-create-dialog.component';
import { RecipePatchDialogComponent } from '../../recipes/dialogs/recipe-patch-dialog/recipe-patch-dialog.component';
import { RecipeEditorComponent } from '../../recipes/dialogs/recipe-editor/recipe-editor.component';
import { MacroChartComponent } from '../components/macro-chart/macro-chart.component';
import type { NutritionSummary } from '../models/nutrition-result';

@Component({ selector: 'app-macro-chart', template: '' })
class MacroChartStubComponent {
  readonly nutrition = input.required<NutritionSummary>();
  readonly showKcal = input(true);
}

@Component({ template: '' })
class HostComponent {}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const cases = [
  { domain: 'foodstuff', mode: 'create' },
  { domain: 'foodstuff', mode: 'edit' },
  { domain: 'recipe', mode: 'create' },
  { domain: 'recipe', mode: 'edit' },
] as const;
describe.each(cases)('$domain $mode image dialog', ({ domain, mode }) => {
  const imageId = '00000000-0000-4000-8000-000000000010';
  const existing: FoodstuffOut = {
    id: 3,
    name: 'Basilikum',
    brand: null,
    unit: 'G',
    unitVerbose: 'g',
    imageId: null,
    kcal: null,
    carbs: null,
    protein: null,
    fat: null,
    recipeVersionIds: [],
  };
  const recipe: RecipeVersionOut = {
    recipeLineageId: '00000000-0000-4000-8000-000000000001',
    recipeVersionId: '00000000-0000-4000-8000-000000000002',
    name: 'Basilikum',
    servings: 2,
    preptime: null,
    ingredients: [],
    steps: [],
    state: 'active',
    createdAt: '2026-10-17T10:00:00Z',
    lastModified: '2026-10-17T10:00:00Z',
    imageId: null,
    imageDimensions: null,
    kcal: { status: 'unknown', value: null },
    carbs: { status: 'unknown', value: null },
    protein: { status: 'unknown', value: null },
    fat: { status: 'unknown', value: null },
  };
  const record = domain === 'foodstuff' ? existing : recipe;
  const upload = vi.fn();
  const save = vi.fn();
  const notify = vi.fn();
  const fetch = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    fetch.mockResolvedValue(existing);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi
          .fn()
          .mockReturnValue('blob:preview');
        static override revokeObjectURL = revokeObjectURL;
      },
    );
    TestBed.configureTestingModule({
      imports: [HostComponent, MatDialogModule],
      providers: [
        {
          provide: RecipeImageService,
          useValue: { upload, download: vi.fn() },
        },
        {
          provide: RecipeBackendService,
          useValue: {
            createRecipe: save,
            publishActiveRecipeEdit: save,
            getActiveRecipeVersion: vi.fn().mockResolvedValue(recipe),
            notifyRecipesChanged: notify,
          },
        },
        {
          provide: Router,
          useValue: { navigate: vi.fn().mockResolvedValue(true) },
        },
        {
          provide: FoodstuffImageService,
          useValue: { upload, download: vi.fn() },
        },
        {
          provide: FoodstuffBackendService,
          useValue: {
            postFoodstuff: save,
            patchFoodstuff: save,
            getFoodstuffById: fetch,
            notifyFoodstuffsChanged: notify,
          },
        },
        { provide: SnackBarService, useValue: { open: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(FoodstuffFormComponent, {
      remove: { imports: [MacroChartComponent] },
      add: { imports: [MacroChartStubComponent] },
    });
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function openDialog(initialDisableClose = false) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const dialog = TestBed.inject(MatDialog);
    const ref =
      domain === 'foodstuff'
        ? mode === 'create'
          ? dialog.open(FoodstuffCreateDialogComponent, {
              disableClose: initialDisableClose,
            })
          : dialog.open(FoodstuffPatchDialogComponent, {
              data: { id: existing.id },
              disableClose: initialDisableClose,
            })
        : mode === 'create'
          ? dialog.open(RecipeCreateDialogComponent, {
              disableClose: initialDisableClose,
            })
          : dialog.open(RecipePatchDialogComponent, {
              data: { recipeVersion: recipe },
              disableClose: initialDisableClose,
            });
    await fixture.whenStable();
    const element = document.querySelector(
      domain === 'foodstuff' ? 'app-foodstuff-form' : 'app-recipe-editor',
    );
    const debug = getDebugNode(element);
    if (!(debug instanceof DebugElement))
      throw new Error('Missing image editor');
    const form =
      domain === 'foodstuff'
        ? debug.injector.get(FoodstuffFormComponent)
        : debug.injector.get(RecipeEditorComponent);
    if (form instanceof FoodstuffFormComponent)
      form.form.patchValue({ name: 'Basilikum', unit: 'G' });
    else
      form.recipeForm.controls.metaFormGroup.controls.name.setValue(
        'Basilikum',
      );
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: {
        item: () => new File(['png'], 'basil.png', { type: 'image/png' }),
      },
    });
    form.image.selectImage(input);
    return { fixture, ref, form };
  }

  function submit(
    form: FoodstuffFormComponent | RecipeEditorComponent,
  ): Promise<void> {
    return TestBed.inject(NgZone).run(() =>
      form instanceof FoodstuffFormComponent
        ? form.onSubmit()
        : form.onSubmit('publish'),
    );
  }

  it('blocks closing throughout upload/save, preserves failed saves, and retries without uploading again', async () => {
    const transfer = deferred<{ id: string }>();
    const firstSave = deferred<FoodstuffOut | RecipeVersionOut>();
    upload.mockReturnValue(transfer.promise);
    save
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValue({ ...record, imageId });
    const { fixture, ref, form } = await openDialog();
    const closed = vi.fn();
    ref.afterClosed().subscribe(closed);
    const pending = submit(form);
    await fixture.whenStable();
    expect(
      document.querySelector('app-image-editor .image-actions [role="status"]')
        ?.textContent,
    ).toContain('Bild wird hochgeladen und geprüft');
    expect(
      document.querySelector('app-image-editor img')?.getAttribute('alt'),
    ).toBe('Bildvorschau');
    expect(
      document.querySelector('app-image-editor')?.closest('[inert]'),
    ).toBeNull();
    if (domain === 'recipe') {
      expect(
        document.querySelector('app-recipe-meta-form')?.hasAttribute('inert'),
      ).toBe(true);
      expect(
        document
          .querySelector('app-recipe-ingredients-form')
          ?.hasAttribute('inert'),
      ).toBe(true);
      expect(
        document
          .querySelector('app-recipe-preparation-form')
          ?.hasAttribute('inert'),
      ).toBe(true);
    }
    expect(ref.disableClose).toBe(true);
    const close = document.querySelector<HTMLButtonElement>(
      'app-dialog-header button',
    );
    expect(close?.disabled).toBe(true);
    close?.click();
    document
      .querySelector('.cdk-overlay-backdrop')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('mat-dialog-container')?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        keyCode: 27,
        bubbles: true,
      }),
    );
    expect(closed).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await submit(form);
    expect(upload).toHaveBeenCalledOnce();
    transfer.resolve({ id: imageId });
    await pending;
    await fixture.whenStable();
    expect(ref.disableClose).toBe(true);
    expect(close?.disabled).toBe(true);
    await submit(form);
    expect(save).toHaveBeenCalledOnce();
    firstSave.reject(new Error('unavailable'));
    await fixture.whenStable();
    expect(ref.disableClose).toBe(false);
    expect(close?.disabled).toBe(false);
    expect(
      (form instanceof FoodstuffFormComponent ? form.form : form.recipeForm)
        .enabled,
    ).toBe(true);
    expect(
      form instanceof FoodstuffFormComponent
        ? form.form.controls.name.value
        : form.recipeForm.controls.metaFormGroup.controls.name.value,
    ).toBe('Basilikum');
    expect(form.image.imagePreview()).toBe('blob:preview');
    expect(notify).not.toHaveBeenCalled();
    await submit(form);
    await fixture.whenStable();
    expect(upload).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledTimes(2);
    const expected: unknown = expect.objectContaining({
      name: 'Basilikum',
      imageId,
    });
    if (mode === 'create') expect(save).toHaveBeenLastCalledWith(expected);
    else
      expect(save).toHaveBeenLastCalledWith(
        domain === 'foodstuff' ? existing.id : recipe.recipeLineageId,
        expected,
      );
    expect(notify).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
    if (mode === 'create' && domain === 'foodstuff')
      expect(closed).toHaveBeenCalledWith({ ...existing, imageId });
  });

  it('restores the caller’s dismissal policy after an upload failure', async () => {
    upload.mockRejectedValue(new Error('unavailable'));
    const { fixture, ref, form } = await openDialog(true);
    await submit(form);
    await fixture.whenStable();
    expect(ref.disableClose).toBe(true);
    expect(
      document.querySelector<HTMLButtonElement>('app-dialog-header button')
        ?.disabled,
    ).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(form.busy()).toBe(false);
  });

  it('disables every save action until an invalid image selection is discarded', async () => {
    const { fixture, form } = await openDialog();
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: {
        item: () => new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' }),
      },
    });
    form.image.selectImage(input);
    await fixture.whenStable();
    const selector =
      domain === 'foodstuff'
        ? 'app-foodstuff-form button[type="submit"]'
        : 'app-recipe-editor .button-wrapper button';
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(selector),
    );
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    buttons.forEach((button) => button.click());
    expect(upload).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    form.image.discardInvalidSelection();
    await fixture.whenStable();
    expect(buttons.every((button) => !button.disabled)).toBe(true);
  });

  it('allows closing before submission without uploading or changing catalogue data', async () => {
    const { fixture, ref } = await openDialog();
    const closed = vi.fn();
    ref.afterClosed().subscribe(closed);
    document
      .querySelector<HTMLButtonElement>('app-dialog-header button')
      ?.click();
    await fixture.whenStable();
    expect(closed).toHaveBeenCalledOnce();
    expect(upload).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
});
