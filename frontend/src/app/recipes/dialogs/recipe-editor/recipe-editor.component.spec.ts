import { By } from '@angular/platform-browser';
import { RecipeIngredientsFormComponent } from '../forms/recipe-ingredients-form/recipe-ingredients-form.component';
import type { RecipeVersionOut } from '../../../core/api/generated';
import type { Mock } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { FoodstuffBackendService } from '../../../foodstuffs/services/foodstuff-backend.service';

import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipeImageService } from '../../services/recipe-image.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { RecipeEditorComponent } from './recipe-editor.component';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';

describe('RecipeEditorComponent', () => {
  let fixture: ComponentFixture<RecipeEditorComponent>;
  let component: RecipeEditorComponent;
  let foodstuffBackend: {
    getAllFoodstuffs: Mock;
    foodstuffsChanged$: Subject<void>;
  };
  let recipeBackend: {
    getActiveRecipeVersion: Mock;
    getRecipeVersion: Mock;
  };
  const revokeObjectURL = vi.fn<typeof URL.revokeObjectURL>();
  let imageService: { upload: Mock; download: Mock };
  let closing: Subject<void>;
  const imageId = '00000000-0000-4000-8000-000000000003';

  const recipeVersion: RecipeVersionOut = {
    imageId: null,
    imageDimensions: null,
    recipeLineageId: '00000000-0000-4000-8000-000000000001',
    recipeVersionId: '00000000-0000-0000-0000-000000000001',
    state: 'active',
    createdAt: '2026-09-10T10:00:00Z',
    lastModified: '2026-09-10T10:00:00Z',
    name: 'Linsensuppe',
    servings: 2,
    preptime: 20,
    kcal: { status: 'unknown' as const, value: null },
    carbs: { status: 'unknown' as const, value: null },
    protein: { status: 'unknown' as const, value: null },
    fat: { status: 'unknown' as const, value: null },
    ingredients: [],
    steps: [],
  };

  beforeEach(async () => {
    revokeObjectURL.mockClear();
    closing = new Subject<void>();
    imageService = {
      upload: vi.fn().mockResolvedValue({ id: imageId }),
      download: vi.fn().mockResolvedValue({
        url: '/storage/saved.png?signature=test',
        expiresIn: 300,
      }),
    };
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi
          .fn()
          .mockReturnValue('blob:preview');
        static override revokeObjectURL = revokeObjectURL;
      },
    );
    foodstuffBackend = {
      getAllFoodstuffs: vi
        .fn()
        .mockName('getAllFoodstuffs')
        .mockResolvedValue([]),
      foodstuffsChanged$: new Subject<void>(),
    };
    recipeBackend = {
      getActiveRecipeVersion: vi
        .fn()
        .mockName('getActiveRecipeVersion')
        .mockResolvedValue(recipeVersion),
      getRecipeVersion: vi
        .fn()
        .mockName('getRecipeVersion')
        .mockResolvedValue(recipeVersion),
    };

    await TestBed.configureTestingModule({
      imports: [RecipeEditorComponent],
      providers: [
        { provide: FoodstuffBackendService, useValue: foodstuffBackend },
        { provide: RecipeBackendService, useValue: recipeBackend },
        { provide: RecipeImageService, useValue: imageService },
        {
          provide: SnackBarService,
          useValue: { open: vi.fn().mockName('open') },
        },
        { provide: MatDialog, useValue: {} },
        { provide: MatDialogRef, useValue: { beforeClosed: () => closing } },
      ],
    })
      .overrideComponent(MacroChartComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(RecipeEditorComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    vi.unstubAllGlobals();
  });

  function selectFile(file: File | null): void {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: { item: () => file } });
    component.image.selectImage(input);
  }

  it('opens a new recipe without loading the foodstuff catalogue', async () => {
    foodstuffBackend.getAllFoodstuffs.mockRejectedValue(
      new Error('Catalogue unavailable'),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.state()).toEqual({ status: 'ready' });
    expect(foodstuffBackend.getAllFoodstuffs).not.toHaveBeenCalled();
    const form = fixture.debugElement.query(
      By.directive(RecipeIngredientsFormComponent),
    ).componentInstance as RecipeIngredientsFormComponent;
    expect(form.selectedFoodstuffs()).toEqual([]);
    foodstuffBackend.foodstuffsChanged$.next();
    expect(foodstuffBackend.getAllFoodstuffs).not.toHaveBeenCalled();
  });

  it('previews locally without uploading, preserves selection on picker cancel and releases it on dialog cancel', () => {
    selectFile(new File(['png'], 'recipe.png', { type: 'image/png' }));
    expect(component.image.imagePreview()).toBe('blob:preview');
    selectFile(null);
    expect(component.image.imagePreview()).toBe('blob:preview');
    expect(imageService.upload).not.toHaveBeenCalled();
    fixture.destroy();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('uploads only after form validation and reuses the validated image after a failed recipe save', async () => {
    const file = new File(['png'], 'recipe.png', { type: 'image/png' });
    selectFile(file);
    const emitted = vi.fn();
    component.submitted.subscribe(emitted);
    await component.onSubmit('publish');
    expect(imageService.upload).not.toHaveBeenCalled();
    component.recipeForm.controls.metaFormGroup.controls.name.setValue(
      'New recipe',
    );
    await component.onSubmit('publish');
    expect(imageService.upload).toHaveBeenCalledExactlyOnceWith(file);
    expect(emitted).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeVersion: expect.objectContaining({ imageId }) as object,
      }),
    );
    fixture.componentRef.setInput('submitting', true);
    await component.onSubmit('publish');
    expect(emitted).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('submitting', false);
    await component.onSubmit('draft');
    expect(imageService.upload).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'draft',
        recipeVersion: expect.objectContaining({ imageId }) as object,
      }),
    );
  });

  it('keeps a failed replacement and recipe data for explicit retry without submitting the old image', async () => {
    component.recipeVersion.set({
      ...recipeVersion,
      imageId: 'previous-image',
    });
    component.recipeForm.controls.metaFormGroup.controls.name.setValue(
      'Edited name',
    );
    selectFile(new File(['png'], 'recipe.png', { type: 'image/png' }));
    imageService.upload.mockRejectedValueOnce(new Error('Invalid PNG'));
    const emitted = vi.fn();
    component.submitted.subscribe(emitted);
    await component.onSubmit('publish');
    expect(emitted).not.toHaveBeenCalled();
    expect(component.image.imageError()).toContain('erneut speichern');
    expect(component.image.imagePreview()).toBe('blob:preview');
    expect(component.recipeVersion()?.imageId).toBe('previous-image');
    expect(
      component.recipeForm.controls.metaFormGroup.controls.name.value,
    ).toBe('Edited name');
    await component.onSubmit('publish');
    expect(imageService.upload).toHaveBeenCalledTimes(2);
    expect(emitted).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeVersion: expect.objectContaining({ imageId }) as object,
      }),
    );
  });

  it('prevents duplicate saves and changes while uploading, and does not submit while the dialog closes', async () => {
    let complete!: (value: { id: string }) => void;
    imageService.upload.mockReturnValue(
      new Promise<{ id: string }>((resolve) => {
        complete = resolve;
      }),
    );
    component.recipeForm.controls.metaFormGroup.controls.name.setValue(
      'Recipe',
    );
    selectFile(new File(['png'], 'recipe.png', { type: 'image/png' }));
    const emitted = vi.fn();
    component.submitted.subscribe(emitted);
    const save = component.onSubmit('publish');
    expect(component.busy()).toBe(true);
    await component.onSubmit('draft');
    component.image.removeImage();
    expect(component.image.hasImage()).toBe(true);
    expect(imageService.upload).toHaveBeenCalledTimes(1);
    closing.next();
    complete({ id: imageId });
    await save;
    expect(emitted).not.toHaveBeenCalled();
  });

  it.each([
    new File(['jpeg'], 'recipe.jpg', { type: 'image/jpeg' }),
    new File([], 'empty.png', { type: 'image/png' }),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', {
      type: 'image/png',
    }),
  ])(
    'blocks saving an invalid selection until it is discarded: $name',
    async (file) => {
      const navigate = vi
        .spyOn(component, 'goToSection')
        .mockImplementation(() => {});
      component.recipeForm.controls.metaFormGroup.controls.name.setValue(
        'Recipe',
      );
      const emitted = vi.fn();
      component.submitted.subscribe(emitted);
      selectFile(new File(['png'], 'valid.png', { type: 'image/png' }));
      selectFile(file);
      expect(component.image.imageError()).toContain('höchstens 10 MiB');
      expect(component.image.imagePreview()).toBe('blob:preview');
      expect(revokeObjectURL).not.toHaveBeenCalled();
      await component.onSubmit('publish');
      expect(navigate).toHaveBeenCalledWith('basics');
      expect(imageService.upload).not.toHaveBeenCalled();
      expect(emitted).not.toHaveBeenCalled();
      component.image.discardInvalidSelection();
      await component.onSubmit('publish');
      expect(imageService.upload).toHaveBeenCalledTimes(1);
    },
  );

  it('submits explicit removal and shows the placeholder without changing the saved source', async () => {
    component.recipeVersion.set({ ...recipeVersion, imageId });
    component.recipeForm.controls.metaFormGroup.controls.name.setValue(
      'Recipe',
    );
    const emitted = vi.fn();
    component.submitted.subscribe(emitted);
    selectFile(new File(['png'], 'recipe.png', { type: 'image/png' }));
    component.image.removeImage();
    expect(component.image.hasImage()).toBe(false);
    expect(component.image.imagePreview()).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    await component.onSubmit('publish');
    expect(emitted).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeVersion: expect.objectContaining({ imageId: null }) as object,
      }),
    );
    expect(component.recipeVersion()?.imageId).toBe(imageId);
    expect(imageService.upload).not.toHaveBeenCalled();
  });

  it('loads the saved preview and offers an explicit fresh URL retry after a delivery error', async () => {
    recipeBackend.getActiveRecipeVersion.mockResolvedValue({
      ...recipeVersion,
      imageId,
    });
    fixture.componentRef.setInput(
      'recipeLineageId',
      recipeVersion.recipeLineageId,
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(imageService.download).toHaveBeenCalledWith(imageId);
    await fixture.whenStable();
    fixture.detectChanges();
    const image = (fixture.nativeElement as HTMLElement).querySelector(
      '.image-preview img',
    ) as HTMLImageElement;
    expect(image.getAttribute('src')).toContain('/storage/saved.png');
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.image-preview img')
        ?.getAttribute('src'),
    ).toBe('assets/images/recipe-image-placeholder.png');
    expect(imageService.download).toHaveBeenCalledTimes(1);
    const retry = Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.includes('Bild erneut laden'))!;
    retry.click();
    await fixture.whenStable();
    expect(imageService.download).toHaveBeenCalledTimes(2);
    expect(component.image.imageAccessFailed()).toBe(false);
  });

  it('does not let a late saved-image request overwrite a selected replacement or removal', async () => {
    let finish!: (value: { url: string; expiresIn: number }) => void;
    imageService.download.mockReturnValue(
      new Promise<{ url: string; expiresIn: number }>((resolve) => {
        finish = resolve;
      }),
    );
    component.recipeVersion.set({ ...recipeVersion, imageId });
    const load = component.image.loadImagePreview();
    selectFile(new File(['png'], 'recipe.png', { type: 'image/png' }));
    finish({ url: '/storage/old.png', expiresIn: 300 });
    await load;
    expect(component.image.imagePreview()).toBe('blob:preview');
    component.image.removeImage();
    expect(component.image.imagePreview()).toBeNull();
  });

  it('preserves an existing image reference when preview access fails', async () => {
    component.recipeVersion.set({ ...recipeVersion, imageId });
    component.recipeForm.controls.metaFormGroup.controls.name.setValue(
      'Recipe',
    );
    imageService.download.mockRejectedValue(new Error('Unavailable'));
    await component.image.loadImagePreview();
    expect(component.image.imageAccessFailed()).toBe(true);
    const emitted = vi.fn();
    component.submitted.subscribe(emitted);
    await component.onSubmit('draft');
    expect(emitted).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeVersion: expect.objectContaining({ imageId }) as object,
      }),
    );
  });

  it('becomes ready after loading the recipe without loading the catalogue', async () => {
    fixture.componentRef.setInput(
      'recipeLineageId',
      recipeVersion.recipeLineageId,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(recipeBackend.getActiveRecipeVersion).toHaveBeenCalledTimes(1);

    expect(recipeBackend.getActiveRecipeVersion).toHaveBeenCalledWith(
      recipeVersion.recipeLineageId,
    );
    expect(component.recipeVersion()).toEqual(recipeVersion);
    expect(component.state()).toEqual({ status: 'ready' });
  });

  it('reports a recipe-specific error when the recipe request fails', async () => {
    recipeBackend.getActiveRecipeVersion.mockRejectedValue(
      new Error('Recipe not found'),
    );
    fixture.componentRef.setInput(
      'recipeLineageId',
      recipeVersion.recipeLineageId,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.state()).toEqual({
      status: 'error',
      source: 'recipeVersion',
    });
    expect(component.errorMessage()).toBe(
      'Rezept konnte nicht geladen werden.',
    );
  });

  it('shows all editor sections together when ready', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const sections = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        'section.form-section',
      ),
    );
    expect(
      sections.map((section) =>
        section.querySelector('h2')?.textContent?.trim(),
      ),
    ).toEqual(['Basisdaten', 'Zutaten', 'Zubereitung']);
    expect(
      sections.every((section) =>
        section.querySelector(
          'app-recipe-meta-form, app-recipe-ingredients-form, app-recipe-preparation-form',
        ),
      ),
    ).toBe(true);
  });

  it('starts create mode empty and can add, validate, remove and save preparation steps', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const ingredients =
      component.recipeForm.controls.ingredientsFormGroup.controls.ingredients;
    const steps =
      component.recipeForm.controls.preparationFormGroup.controls.steps;
    const preparation = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLElement>('app-recipe-preparation-form')!;
    expect(ingredients.length).toBe(0);
    expect(steps.length).toBe(0);
    expect(preparation.querySelector('.step-wrapper')).toBeNull();

    const emitted = vi.fn();
    component.submitted.subscribe(emitted);
    component.recipeForm.controls.metaFormGroup.controls.name.setValue(
      'New recipe',
    );
    preparation.querySelector<HTMLButtonElement>('.add-button')!.click();
    fixture.detectChanges();
    expect(steps.length).toBe(1);
    expect(preparation.querySelectorAll('.step-wrapper')).toHaveLength(1);
    expect(steps.at(0).controls.description.hasError('required')).toBe(true);

    await component.onSubmit('publish');
    expect(emitted).not.toHaveBeenCalled();

    preparation.querySelector<HTMLButtonElement>('.remove-button')!.click();
    fixture.detectChanges();
    expect(ingredients.length).toBe(0);
    expect(steps.length).toBe(0);
    expect(preparation.querySelector('.step-wrapper')).toBeNull();

    await component.onSubmit('publish');
    expect(emitted).toHaveBeenCalledExactlyOnceWith({
      action: 'publish',
      recipeVersion: {
        name: 'New recipe',
        servings: 2,
        preptime: null,
        ingredients: [],
        steps: [],
      },
    });
  });

  it.each(['active', 'draft'] as const)(
    'loads and saves an empty %s recipe without inserting preparation rows',
    async (mode) => {
      recipeBackend.getRecipeVersion.mockResolvedValue({
        ...recipeVersion,
        state: mode,
      });
      fixture.componentRef.setInput('mode', mode);
      fixture.componentRef.setInput(
        'recipeLineageId',
        recipeVersion.recipeLineageId,
      );
      fixture.componentRef.setInput(
        'recipeVersionId',
        recipeVersion.recipeVersionId,
      );
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        component.recipeForm.controls.ingredientsFormGroup.controls.ingredients
          .length,
      ).toBe(0);
      expect(
        component.recipeForm.controls.preparationFormGroup.controls.steps
          .length,
      ).toBe(0);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.step-wrapper'),
      ).toBeNull();

      const emitted = vi.fn();
      component.submitted.subscribe(emitted);
      await component.onSubmit('publish');
      expect(emitted).toHaveBeenCalledExactlyOnceWith({
        action: 'publish',
        recipeVersion: {
          imageId: null,
          name: recipeVersion.name,
          servings: recipeVersion.servings,
          preptime: recipeVersion.preptime,
          ingredients: [],
          steps: [],
        },
      });
    },
  );

  it.each(['active', 'draft'] as const)(
    'preserves existing ingredients and amounts in %s mode with fixed foodstuffs',
    async (mode) => {
      const foodstuff = {
        id: 1,
        name: 'Pasta',
        brand: 'Barilla',
        unit: 'G' as const,
        imageId: null,
        unitVerbose: 'g',
        kcal: null,
        carbs: null,
        protein: null,
        fat: null,
        recipeVersionIds: [],
      };
      const version = {
        ...recipeVersion,
        state: mode,
        ingredients: [
          {
            id: 1,
            index: 1,
            amount: 125,
            foodstuff,
            recipeVersionId: recipeVersion.recipeVersionId,
          },
        ],
      };
      foodstuffBackend.getAllFoodstuffs.mockRejectedValue(
        new Error('Catalogue unavailable'),
      );
      recipeBackend.getActiveRecipeVersion.mockResolvedValue(version);
      recipeBackend.getRecipeVersion.mockResolvedValue(version);
      fixture.componentRef.setInput('mode', mode);
      fixture.componentRef.setInput('recipeLineageId', version.recipeLineageId);
      fixture.componentRef.setInput('recipeVersionId', version.recipeVersionId);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(
        component.recipeForm.controls.ingredientsFormGroup.controls.ingredients.getRawValue(),
      ).toEqual([{ index: 1, foodstuffId: 1, amount: 125 }]);
      const ingredientSection = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLElement>('app-recipe-ingredients-form')!;
      expect(ingredientSection.querySelector('mat-select')).toBeNull();
      expect(ingredientSection.textContent).toContain('Barilla');
      expect(foodstuffBackend.getAllFoodstuffs).not.toHaveBeenCalled();
      const form = fixture.debugElement.query(
        By.directive(RecipeIngredientsFormComponent),
      ).componentInstance as RecipeIngredientsFormComponent;
      expect(form.selectedFoodstuffs()).toEqual([foodstuff]);
    },
  );

  it('navigates to a section and follows manual dialog scrolling', async () => {
    const scrollArea = document.createElement('mat-dialog-content');
    scrollArea.appendChild(fixture.nativeElement as HTMLElement);
    const scrollTo = vi.fn();
    Object.defineProperty(scrollArea, 'scrollTo', { value: scrollTo });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const nav = (fixture.nativeElement as HTMLElement).querySelector(
      '.section-nav',
    ) as HTMLElement;
    const sections = (
      fixture.nativeElement as HTMLElement
    ).querySelectorAll<HTMLElement>('.form-section');
    vi.spyOn(nav, 'offsetHeight', 'get').mockReturnValue(44);
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 400,
    } as DOMRect);
    vi.spyOn(sections[1], 'getBoundingClientRect').mockReturnValue({
      top: 280,
    } as DOMRect);
    const buttons = (
      fixture.nativeElement as HTMLElement
    ).querySelectorAll<HTMLButtonElement>('.section-nav button');

    buttons[1].click();
    expect(scrollTo).toHaveBeenCalled();
    expect(
      vi.mocked(scrollTo).mock.lastCall![0] as unknown as ScrollToOptions,
    ).toEqual({ top: 228, behavior: 'smooth' });
    expect(component.activeSection()).toBe('ingredients');

    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({
      bottom: 60,
    } as DOMRect);
    vi.spyOn(sections[0], 'getBoundingClientRect').mockReturnValue({
      top: -200,
    } as DOMRect);
    (sections[1].getBoundingClientRect as Mock).mockReturnValue({
      top: 40,
    });
    vi.spyOn(sections[2], 'getBoundingClientRect').mockReturnValue({
      top: 300,
    } as DOMRect);
    vi.spyOn(scrollArea, 'scrollHeight', 'get').mockReturnValue(600);
    vi.spyOn(scrollArea, 'clientHeight', 'get').mockReturnValue(400);
    vi.spyOn(scrollArea, 'scrollTop', 'get').mockReturnValue(200);
    scrollArea.dispatchEvent(new Event('scroll'));
    expect(component.activeSection()).toBe('ingredients');
    fixture.detectChanges();
    expect(buttons[1].classList.contains('active')).toBe(true);

    (sections[2].getBoundingClientRect as Mock).mockReturnValue({
      top: 180,
    });
    buttons[2].click();
    scrollArea.dispatchEvent(new Event('scroll'));
    expect(component.activeSection()).toBe('preparation');

    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    expect(component.activeSection()).toBe('preparation');
    fixture.detectChanges();
    expect(buttons[2].classList.contains('active')).toBe(true);

    (sections[2].getBoundingClientRect as Mock).mockReturnValue({
      top: 340,
    });
    scrollArea.dispatchEvent(new Event('scroll'));
    expect(component.activeSection()).toBe('preparation');

    buttons[1].click();
    scrollArea.dispatchEvent(new Event('scroll'));
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    expect(component.activeSection()).toBe('ingredients');
    fixture.detectChanges();
    expect(buttons[1].classList.contains('active')).toBe(true);

    scrollArea.dispatchEvent(new Event('scroll'));
    expect(component.activeSection()).toBe('preparation');

    buttons[1].click();
    scrollArea.dispatchEvent(new Event('touchmove'));
    scrollArea.dispatchEvent(new Event('scroll'));
    expect(component.activeSection()).toBe('preparation');

    scrollArea.remove();
  });

  it('submits a complete numeric write payload with step indexes derived from visible form order', async () => {
    component.recipeForm.controls.metaFormGroup.controls.name.setValue(
      'Linsensuppe',
    );
    component.recipeForm.controls.ingredientsFormGroup.controls.ingredients.push(
      new FormGroup({
        index: new FormControl<number | null>(1),
        amount: new FormControl<number | null>(12.5),
        foodstuffId: new FormControl<number | null>(1),
      }),
    );
    component.recipeForm.controls.preparationFormGroup.controls.steps.push(
      new FormGroup({
        description: new FormControl(
          'Servieren',
          Validators.required.bind(Validators),
        ),
      }),
    );
    component.recipeForm.controls.preparationFormGroup.controls.steps.push(
      new FormGroup({
        description: new FormControl(
          'Kochen',
          Validators.required.bind(Validators),
        ),
      }),
    );
    const emitted = vi.fn().mockName('emitted');
    component.submitted.subscribe(emitted);

    await component.onSubmit('publish');

    expect(emitted).toHaveBeenCalledTimes(1);

    expect(emitted).toHaveBeenCalledWith({
      action: 'publish',
      recipeVersion: {
        name: 'Linsensuppe',
        servings: 2,
        preptime: null,
        ingredients: [{ index: 1, amount: 12.5, foodstuffId: 1 }],
        steps: [
          { index: 1, description: 'Servieren' },
          { index: 2, description: 'Kochen' },
        ],
      },
    });
  });

  it.each([null, '00000000-0000-4000-8000-000000000003'])(
    'preserves the loaded image reference %s when publishing or saving a draft',
    async (imageId) => {
      component.recipeVersion.set({ ...recipeVersion, imageId });
      component.recipeForm.controls.metaFormGroup.controls.name.setValue(
        'Edited',
      );
      const emitted = vi.fn();
      component.submitted.subscribe(emitted);

      await component.onSubmit('publish');
      await component.onSubmit('draft');

      expect(emitted).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          action: 'publish',
          recipeVersion: expect.objectContaining({ imageId }) as object,
        }),
      );
      expect(emitted).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          action: 'draft',
          recipeVersion: expect.objectContaining({ imageId }) as object,
        }),
      );
    },
  );

  it('does not submit an invalid step description', async () => {
    component.recipeForm.controls.metaFormGroup.controls.name.setValue(
      'Linsensuppe',
    );
    component.recipeForm.controls.preparationFormGroup.controls.steps.push(
      new FormGroup({
        description: new FormControl('', Validators.required.bind(Validators)),
      }),
    );
    const emitted = vi.fn().mockName('emitted');
    component.submitted.subscribe(emitted);

    await component.onSubmit('publish');

    expect(emitted).not.toHaveBeenCalled();
  });

  it('keeps Save available and shows the first required field error on an invalid attempt', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const save = (fixture.nativeElement as HTMLElement).querySelector(
      '.button-wrapper button',
    ) as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    save.click();
    fixture.detectChanges();

    expect(
      component.recipeForm.controls.metaFormGroup.controls.name.touched,
    ).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('#basics mat-error')
        ?.textContent,
    ).toContain('Bitte einen Namen eingeben.');
  });

  it('jumps to the first invalid ingredient field after Basics is valid', async () => {
    const scrollArea = document.createElement('mat-dialog-content');
    scrollArea.appendChild(fixture.nativeElement as HTMLElement);
    const scrollTo = vi.fn();
    Object.defineProperty(scrollArea, 'scrollTo', { value: scrollTo });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    component.recipeForm.controls.metaFormGroup.controls.name.setValue(
      'Linsensuppe',
    );
    const ingredients = (fixture.nativeElement as HTMLElement).querySelector(
      'app-recipe-ingredients-form',
    ) as HTMLElement;
    const ingredientForm = fixture.debugElement.query(
      By.directive(RecipeIngredientsFormComponent),
    ).componentInstance as RecipeIngredientsFormComponent;
    ingredientForm.addIngredient({
      id: 1,
      name: 'Pasta',
      brand: null,
      unit: 'G',
      imageId: null,
      unitVerbose: 'g',
      kcal: null,
      carbs: null,
      protein: null,
      fat: null,
    });
    fixture.detectChanges();

    (
      (fixture.nativeElement as HTMLElement).querySelector(
        '.button-wrapper button',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(component.activeSection()).toBe('ingredients');
    expect(scrollTo).toHaveBeenCalled();
    const amount =
      component.recipeForm.controls.ingredientsFormGroup.controls.ingredients.at(
        0,
      ).controls.amount;
    expect(amount.hasError('required')).toBe(true);
    expect(amount.touched).toBe(true);
    expect(ingredients.querySelector('[role="alert"]')).toBeNull();

    component.recipeForm.controls.ingredientsFormGroup.controls.ingredients
      .at(0)
      .controls.amount.setValue(100);
    fixture.detectChanges();
    expect(amount.valid).toBe(true);
    scrollArea.remove();
  });
});
