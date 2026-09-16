import type { Mock } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { FoodstuffBackendService } from '../../../foodstuffs/services/foodstuff-backend.service';
import { RecipeVersion } from '../../models/recipe';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { RecipeEditorComponent } from './recipe-editor.component';

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

    const recipeVersion: RecipeVersion = {
        recipeLineageId: '00000000-0000-4000-8000-000000000001',
        recipeVersionId: '00000000-0000-0000-0000-000000000001',
        state: 'active',
        createdAt: '2026-09-10T10:00:00Z',
        lastModified: '2026-09-10T10:00:00Z',
        name: 'Linsensuppe',
        servings: 2,
        preptime: 20,
        originName: null,
        originUrl: null,
        kcal: null,
        carbs: null,
        protein: null,
        fat: null,
        ingredients: [],
        steps: [],
    };

    beforeEach(async () => {
        foodstuffBackend = {
            getAllFoodstuffs: vi.fn().mockName('getAllFoodstuffs').mockResolvedValue([]),
            foodstuffsChanged$: new Subject<void>(),
        };
        recipeBackend = {
            getActiveRecipeVersion: vi.fn().mockName('getActiveRecipeVersion').mockResolvedValue(recipeVersion),
            getRecipeVersion: vi.fn().mockName('getRecipeVersion').mockResolvedValue(recipeVersion),
        };

        await TestBed.configureTestingModule({
            imports: [RecipeEditorComponent],
            providers: [
                { provide: FoodstuffBackendService, useValue: foodstuffBackend },
                { provide: RecipeBackendService, useValue: recipeBackend },
                { provide: SnackBarService, useValue: { open: vi.fn().mockName('open') } },
                { provide: MatDialog, useValue: {} },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(RecipeEditorComponent);
        component = fixture.componentInstance;
    });

    it('becomes ready only after recipe and foodstuff data load', async () => {
        fixture.componentRef.setInput('recipeLineageId', recipeVersion.recipeLineageId);
        fixture.detectChanges();
        await fixture.whenStable();

        expect(recipeBackend.getActiveRecipeVersion).toHaveBeenCalledTimes(1);

        expect(recipeBackend.getActiveRecipeVersion).toHaveBeenCalledWith(recipeVersion.recipeLineageId);
        expect(component.recipeVersion()).toEqual(recipeVersion);
        expect(component.state()).toEqual({ status: 'ready' });
    });

    it('reports a recipe-specific error when the recipe request fails', async () => {
        recipeBackend.getActiveRecipeVersion.mockRejectedValue(new Error('Recipe not found'));
        fixture.componentRef.setInput('recipeLineageId', recipeVersion.recipeLineageId);
        fixture.detectChanges();
        await fixture.whenStable();

        expect(component.state()).toEqual({ status: 'error', source: 'recipeVersion' });
        expect(component.errorMessage()).toBe('Rezept konnte nicht geladen werden.');
    });

    it('shows all editor sections together when ready', async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const sections = Array.from(fixture.nativeElement.querySelectorAll('section.form-section') as NodeListOf<HTMLElement>);
        expect(sections.map((section) => section.querySelector('h2')?.textContent?.trim())).toEqual([
            'Basis',
            'Zutaten',
            'Zubereitung',
        ]);
        expect(sections.every((section) => section.querySelector('app-recipe-meta-form, app-recipe-ingredients-form, app-recipe-preparation-form'))).toBe(true);
    });

    it('starts create mode with one removable ingredient and preparation row', async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const ingredients = component.recipeForm.controls.ingredientsFormGroup.controls.ingredients;
        const steps = component.recipeForm.controls.preparationFormGroup.controls.steps;
        expect(ingredients.length).toBe(1);
        expect(steps.length).toBe(1);

        component.recipeForm.controls.ingredientsFormGroup.controls.ingredients.removeAt(0);
        component.recipeForm.controls.preparationFormGroup.controls.steps.removeAt(0);
        expect(ingredients.length).toBe(0);
        expect(steps.length).toBe(0);
    });

    it('starts an empty edited recipe with one ingredient and preparation row', async () => {
        fixture.componentRef.setInput('recipeLineageId', recipeVersion.recipeLineageId);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(component.recipeForm.controls.ingredientsFormGroup.controls.ingredients.length).toBe(1);
        expect(component.recipeForm.controls.preparationFormGroup.controls.steps.length).toBe(1);
    });

    it('navigates to a section and follows manual dialog scrolling', async () => {
        const scrollArea = document.createElement('mat-dialog-content');
        scrollArea.appendChild(fixture.nativeElement);
        const scrollTo = vi.fn();
        Object.defineProperty(scrollArea, 'scrollTo', { value: scrollTo });
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const nav = fixture.nativeElement.querySelector('.section-nav') as HTMLElement;
        const sections = fixture.nativeElement.querySelectorAll('.form-section') as NodeListOf<HTMLElement>;
        vi.spyOn(nav, 'offsetHeight', 'get').mockReturnValue(44);
        vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 400 } as DOMRect);
        vi.spyOn(sections[1], 'getBoundingClientRect').mockReturnValue({ top: 280 } as DOMRect);
        const buttons = fixture.nativeElement.querySelectorAll('.section-nav button') as NodeListOf<HTMLButtonElement>;

        buttons[1].click();
        expect(scrollTo).toHaveBeenCalled();
        expect(vi.mocked(scrollTo).mock.lastCall![0] as unknown as ScrollToOptions).toEqual({ top: 228, behavior: 'smooth' });
        expect(component.activeSection()).toBe('ingredients');

        vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({ bottom: 60 } as DOMRect);
        vi.spyOn(sections[0], 'getBoundingClientRect').mockReturnValue({ top: -200 } as DOMRect);
        (sections[1].getBoundingClientRect as Mock).mockReturnValue({ top: 40 } as DOMRect);
        vi.spyOn(sections[2], 'getBoundingClientRect').mockReturnValue({ top: 300 } as DOMRect);
        vi.spyOn(scrollArea, 'scrollHeight', 'get').mockReturnValue(600);
        vi.spyOn(scrollArea, 'clientHeight', 'get').mockReturnValue(400);
        vi.spyOn(scrollArea, 'scrollTop', 'get').mockReturnValue(200);
        scrollArea.dispatchEvent(new Event('scroll'));
        expect(component.activeSection()).toBe('ingredients');
        fixture.detectChanges();
        expect(buttons[1].classList.contains('active')).toBe(true);

        (sections[2].getBoundingClientRect as Mock).mockReturnValue({ top: 180 } as DOMRect);
        buttons[2].click();
        scrollArea.dispatchEvent(new Event('scroll'));
        expect(component.activeSection()).toBe('preparation');

        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        expect(component.activeSection()).toBe('preparation');
        fixture.detectChanges();
        expect(buttons[2].classList.contains('active')).toBe(true);

        (sections[2].getBoundingClientRect as Mock).mockReturnValue({ top: 340 } as DOMRect);
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

    it('submits step indexes derived from visible form order', () => {
        component.recipeForm.controls.metaFormGroup.controls.name.setValue('Linsensuppe');
        component.recipeForm.controls.preparationFormGroup.controls.steps.push(new FormGroup({ description: new FormControl('Servieren', Validators.required) }));
        component.recipeForm.controls.preparationFormGroup.controls.steps.push(new FormGroup({ description: new FormControl('Kochen', Validators.required) }));
        const emitted = vi.fn().mockName('emitted');
        component.submitted.subscribe(emitted);

        component.onSubmit('publish');

        expect(emitted).toHaveBeenCalledTimes(1);

        expect(emitted).toHaveBeenCalledWith(expect.objectContaining({
            action: 'publish',
            recipeVersion: expect.objectContaining({
                steps: [
                    { index: 1, description: 'Servieren' },
                    { index: 2, description: 'Kochen' },
                ],
            }),
        }));
    });

    it('does not submit an invalid step description', () => {
        component.recipeForm.controls.metaFormGroup.controls.name.setValue('Linsensuppe');
        component.recipeForm.controls.preparationFormGroup.controls.steps.push(new FormGroup({ description: new FormControl('', Validators.required) }));
        const emitted = vi.fn().mockName('emitted');
        component.submitted.subscribe(emitted);

        component.onSubmit('publish');

        expect(emitted).not.toHaveBeenCalled();
    });

    it('keeps Save available and shows the first required field error on an invalid attempt', async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        const save = fixture.nativeElement.querySelector('.button-wrapper button') as HTMLButtonElement;
        expect(save.disabled).toBe(false);

        save.click();
        fixture.detectChanges();

        expect(component.recipeForm.controls.metaFormGroup.controls.name.touched).toBe(true);
        expect(fixture.nativeElement.querySelector('#basics mat-error')?.textContent).toContain('Bitte einen Namen eingeben.');
    });

    it('jumps to the first invalid ingredient field after Basics is valid', async () => {
        const scrollArea = document.createElement('mat-dialog-content');
        scrollArea.appendChild(fixture.nativeElement);
        const scrollTo = vi.fn();
        Object.defineProperty(scrollArea, 'scrollTo', { value: scrollTo });
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        component.recipeForm.controls.metaFormGroup.controls.name.setValue('Linsensuppe');
        const ingredients = fixture.nativeElement.querySelector('app-recipe-ingredients-form') as HTMLElement;
        (ingredients.querySelector('.add-ingredient-button') as HTMLButtonElement).click();
        fixture.detectChanges();

        (fixture.nativeElement.querySelector('.button-wrapper button') as HTMLButtonElement).click();
        fixture.detectChanges();

        expect(component.activeSection()).toBe('ingredients');
        expect(scrollTo).toHaveBeenCalled();
        expect(ingredients.querySelector('.ingredient-errors')?.textContent).toContain('Bitte ein Lebensmittel auswählen.');
        expect(ingredients.querySelector('.ingredient-errors')?.textContent).toContain('Bitte eine Menge eingeben.');

        component.recipeForm.controls.ingredientsFormGroup.controls.ingredients.at(0).controls.foodstuffId.setValue(1);
        fixture.detectChanges();
        expect(ingredients.querySelector('.ingredient-errors')?.textContent).not.toContain('Bitte ein Lebensmittel auswählen.');
        expect(ingredients.querySelector('.ingredient-errors')?.textContent).toContain('Bitte eine Menge eingeben.');
        scrollArea.remove();
    });
});
