import { Subject } from 'rxjs';

import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup, FormGroupDirective, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ChartLegendElementComponent } from '../../../../core/components/chart-legend-element/chart-legend-element.component';
import { MacroChartComponent } from '../../../../core/components/macro-chart/macro-chart.component';
import { ChartLegendElement } from '../../../../core/models/chart-legend-element';
import type { NutritionSummary } from '../../../../core/models/nutrition-result';
import { By } from '@angular/platform-browser';
import type { FoodstuffOut } from '../../../../core/api/generated';
import { FoodstuffUnit } from '../../../../foodstuffs/models/foodstuff-unit';
import { IngredientFieldComponent } from './ingredient-field/ingredient-field.component';
import { RecipeIngredientsFormComponent } from './recipe-ingredients-form.component';
import { FoodstuffSelectionDialogComponent } from '../../../../foodstuffs/dialogs/foodstuff-selection-dialog/foodstuff-selection-dialog.component';

@Component({ selector: 'app-macro-chart', template: '' })
class MacroChartStubComponent {
    readonly nutrition = input.required<NutritionSummary>();
}

@Component({ selector: 'app-chart-legend-element', template: '' })
class ChartLegendElementStubComponent {
    readonly legendElement = input.required<ChartLegendElement>();
}

describe('RecipeIngredientsFormComponent', () => {
    let fixture: ComponentFixture<RecipeIngredientsFormComponent>;
    let dialogResult: Subject<FoodstuffOut[] | undefined>;

    const foodstuff: FoodstuffOut = {
        id: 1,
        name: 'Haferflocken',
        brand: null,
        unit: FoodstuffUnit.Gram,
        unitVerbose: 'g',
        kcal: 370,
        carbs: 60,
        protein: 13,
        fat: 7,
        recipeVersionIds: [],
    };

    beforeEach(async () => {
        const recipeForm = createRecipeForm();
        dialogResult = new Subject<FoodstuffOut[] | undefined>();

        await TestBed.configureTestingModule({
            imports: [RecipeIngredientsFormComponent],
            providers: [
                { provide: FormGroupDirective, useValue: { control: recipeForm } },
                { provide: MatDialog, useValue: { open: vi.fn().mockReturnValue({ afterClosed: () => dialogResult.asObservable() }) } },
            ],
        })
            .overrideComponent(RecipeIngredientsFormComponent, {
            remove: {
                imports: [
                    MacroChartComponent,
                    ChartLegendElementComponent,
                ],
            },
            add: {
                imports: [
                    MacroChartStubComponent,
                    ChartLegendElementStubComponent,
                ],
            },
        })
            .compileComponents();

        fixture = TestBed.createComponent(RecipeIngredientsFormComponent);
        fixture.componentInstance.selectedFoodstuffs.set( [foodstuff]);
        fixture.detectChanges();
    });

    it('opens the foodstuff dialog without adding or changing ingredient rows', () => {
        const before = fixture.componentInstance.ingredients.getRawValue();
        const button: HTMLButtonElement = fixture.nativeElement.querySelector('.add-ingredient-button');
        button.click();

        expect(TestBed.inject(MatDialog).open).toHaveBeenCalledWith(
            FoodstuffSelectionDialogComponent,
            expect.objectContaining({ data: { existingFoodstuffIds: [1] } }),
        );
        expect(fixture.componentInstance.ingredients.getRawValue()).toEqual(before);
    });

    it('appends confirmed IDs in order, prevents duplicates, and preserves existing amounts', () => {
        const other = { ...foodstuff, id: 2, name: 'Pasta', brand: 'Barilla' };
        fixture.componentInstance.selectedFoodstuffs.set( [foodstuff, other, { ...foodstuff, id: 3 }]);
        fixture.detectChanges();
        fixture.componentInstance.openFoodstuffSelectionDialog();
        dialogResult.next([{ ...foodstuff, id: 3 }, other, foodstuff, other]);
        dialogResult.complete();
        fixture.detectChanges();
        expect(fixture.componentInstance.ingredients.getRawValue()).toEqual([
            { index: 1, foodstuffId: 1, amount: 100 },
            { index: 2, foodstuffId: 3, amount: null },
            { index: 3, foodstuffId: 2, amount: null },
        ]);
        expect(fixture.componentInstance.ingredients.at(1).controls.amount.hasError('required')).toBe(true);
        expect(fixture.nativeElement.querySelector('mat-select')).toBeNull();
        expect(fixture.nativeElement.textContent).toContain('Barilla');
        fixture.componentInstance.removeIngredient(1);
        fixture.detectChanges();
        const fields = fixture.debugElement.queryAll(By.directive(IngredientFieldComponent));
        const remaining = fields[1].componentInstance as IngredientFieldComponent;
        remaining.amountControl().setValue(75);
        expect(fixture.componentInstance.ingredients.getRawValue()).toEqual([
            { index: 1, foodstuffId: 1, amount: 100 },
            { index: 2, foodstuffId: 2, amount: 75 },
        ]);
        fixture.componentInstance.openFoodstuffSelectionDialog();
        expect(TestBed.inject(MatDialog).open).toHaveBeenLastCalledWith(
            FoodstuffSelectionDialogComponent,
            expect.objectContaining({ data: expect.objectContaining({ existingFoodstuffIds: [1, 2] }) }),
        );
    });

    it('retains confirmed records for display and nutrition, and releases removed records', () => {
        const created = { ...foodstuff, id: 2, name: 'Reis' };
        fixture.componentInstance.openFoodstuffSelectionDialog();
        expect(fixture.componentInstance.selectedFoodstuffs()).toEqual([foodstuff]);
        dialogResult.next([created]);
        dialogResult.complete();
        fixture.detectChanges();
        expect(fixture.componentInstance.ingredients.at(1).controls.foodstuffId.value).toBe(2);
        expect(fixture.componentInstance.foodstuffFor(2)).toEqual(created);
        expect(fixture.nativeElement.textContent).toContain('Reis');
        fixture.componentInstance.ingredients.at(1).controls.amount.setValue(100);
        fixture.detectChanges();
        expect(chartNutrition().kcal).toEqual({ status: 'exact', value: 370 });
        fixture.componentInstance.removeIngredient(1);
        expect(fixture.componentInstance.selectedFoodstuffs()).toEqual([foodstuff]);
        expect(fixture.componentInstance.foodstuffFor(2)).toBeUndefined();
    });

    it('leaves rows untouched when the picker is dismissed', () => {
        const before = fixture.componentInstance.ingredients.getRawValue();
        fixture.componentInstance.openFoodstuffSelectionDialog();
        dialogResult.next(undefined);
        dialogResult.complete();
        expect(fixture.componentInstance.ingredients.getRawValue()).toEqual(before);
    });

    it('shows the complete legend beside the chart without a disclosure', () => {
        expect(getLegend()?.querySelectorAll('app-chart-legend-element').length).toBe(3);
        expect(getChartArea().querySelector('app-macro-chart')).not.toBeNull();
        expect(getChartArea().querySelector('.legend')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.details-button')).toBeNull();
    });

    it('shows exact zero values in the legend when every macro is zero', () => {
        fixture.componentInstance.selectedFoodstuffs.set( [
            { ...foodstuff, carbs: 0, protein: 0, fat: 0 },
        ]);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-macro-chart')).not.toBeNull();
        expect(getLegend()?.querySelectorAll('app-chart-legend-element').length).toBe(3);
    });

    it('keeps nutrition visible when a selected ingredient has no amount yet', () => {
        fixture.componentInstance.addIngredient(foodstuff);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-macro-chart')).not.toBeNull();
        expect(getNutritionMessage()).toBeNull();
    });

    it('allows removing the last ingredient row', () => {
        fixture.componentInstance.removeIngredient(0);

        expect(fixture.componentInstance.ingredients.length).toBe(0);
    });

    it('keeps ingredient indexes unique and sequential after adding and removing rows', () => {
        fixture.componentInstance.addIngredient(foodstuff);
        fixture.componentInstance.addIngredient(foodstuff);

        expect(ingredientIndexes()).toEqual([1, 2, 3]);

        fixture.componentInstance.removeIngredient(1);
        fixture.componentInstance.addIngredient(foodstuff);

        expect(ingredientIndexes()).toEqual([1, 2, 3]);
    });

    it('replaces nutrition with the hint immediately while servings are invalid', () => {
        const servingsInput = fixture.nativeElement.querySelector('input[formControlName="servings"]') as HTMLInputElement;
        servingsInput.focus();
        fixture.componentInstance.ingredientsFormGroup.get('servings')?.setValue(null);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-macro-chart')).toBeNull();
        expect(getNutritionMessage()).not.toBeNull();

        fixture.componentInstance.ingredientsFormGroup.get('servings')?.setValue(4);
        fixture.detectChanges();
        expect(chartNutrition().kcal).toEqual({ status: 'exact', value: 92.5 });
        expect(getNutritionMessage()).toBeNull();
    });

    it('updates exact, minimum and unknown values live without retaining the last result', () => {
        fixture.componentInstance.addIngredient(foodstuff);
        const second = fixture.componentInstance.ingredients.at(1);
        second.patchValue({ foodstuffId: 1, amount: 100 });
        fixture.detectChanges();
        expect(chartNutrition().kcal).toEqual({ status: 'exact', value: 370 });

        second.get('amount')?.setValue(null);
        fixture.detectChanges();
        expect(chartNutrition().kcal).toEqual({ status: 'minimum', value: 185 });
        expect(getLegend()?.querySelectorAll('app-chart-legend-element').length).toBe(3);
        expect(second.get('amount')?.hasError('required')).toBe(true);

        fixture.componentInstance.ingredients.at(0).get('amount')?.setValue(null);
        fixture.detectChanges();
        expect(chartNutrition().kcal).toEqual({ status: 'unknown', value: null });

        second.get('amount')?.setValue(200);
        fixture.detectChanges();
        expect(chartNutrition().kcal).toEqual({ status: 'minimum', value: 370 });

        fixture.componentInstance.removeIngredient(0);
        fixture.detectChanges();
        expect(chartNutrition().kcal).toEqual({ status: 'exact', value: 370 });
    });

    it('shows incomplete foodstuff nutrition and an all-unknown empty draft', () => {
        fixture.componentInstance.selectedFoodstuffs.set( [{ ...foodstuff, protein: null }]);
        fixture.detectChanges();
        expect(chartNutrition().protein).toEqual({ status: 'unknown', value: null });
        expect(chartNutrition().carbs).toEqual({ status: 'exact', value: 30 });
        expect(getNutritionMessage()).toBeNull();

        fixture.componentInstance.removeIngredient(0);
        fixture.detectChanges();
        expect(chartNutrition().carbs).toEqual({ status: 'unknown', value: null });
        expect(getLegend()?.querySelectorAll('app-chart-legend-element').length).toBe(3);
    });

    function chartNutrition(): NutritionSummary {
        const chart = fixture.debugElement.query(By.directive(MacroChartStubComponent))
            .componentInstance as MacroChartStubComponent;
        return chart.nutrition();
    }

    it('reserves the preview area in stable states', () => {
        const nutritionSection = fixture.nativeElement.querySelector('.nutrition-section') as HTMLElement;

        expect(getComputedStyle(nutritionSection).minHeight).toBe('208px');
    });

    function getLegend(): HTMLElement | null {
        return fixture.nativeElement.querySelector('#recipe-draft-macro-legend');
    }

    function getChartArea(): HTMLElement {
        return fixture.nativeElement.querySelector('.nutrition-chart-area') as HTMLElement;
    }

    function getNutritionMessage(): HTMLElement | null {
        return fixture.nativeElement.querySelector('.nutrition-message');
    }

    function ingredientIndexes(): Array<number | null> {
        return fixture.componentInstance.ingredients.controls.map((ingredient) => {
            const value: unknown = ingredient.get('index')?.value;
            return typeof value === 'number' ? value : null;
        });
    }
});

function createRecipeForm(): FormGroup {
    return new FormGroup({
        ingredientsFormGroup: new FormGroup({
            servings: new FormControl(2),
            ingredients: new FormArray([
                new FormGroup({
                    index: new FormControl(1),
                    foodstuffId: new FormControl(1),
                    amount: new FormControl(100, Validators.required),
                }),
            ]),
        }),
    });
}
