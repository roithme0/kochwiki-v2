import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup, FormGroupDirective, } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ChartLegendElementComponent } from '../../../../core/components/chart-legend-element/chart-legend-element.component';
import { MacroChartComponent } from '../../../../core/components/macro-chart/macro-chart.component';
import { ChartLegendElement } from '../../../../core/models/chart-legend-element';
import { Foodstuff } from '../../../../foodstuffs/models/foodstuff';
import { FoodstuffUnit } from '../../../../foodstuffs/models/foodstuff-unit';
import { IngredientFieldComponent } from './ingredient-field/ingredient-field.component';
import { RecipeIngredientsFormComponent } from './recipe-ingredients-form.component';

@Component({ selector: 'app-macro-chart', template: '' })
class MacroChartStubComponent {
    readonly nutrition = input.required<unknown>();
    readonly legendUpdated = output<Record<string, ChartLegendElement>>();
}

@Component({ selector: 'app-chart-legend-element', template: '' })
class ChartLegendElementStubComponent {
    readonly legendElement = input.required<ChartLegendElement>();
}

@Component({ selector: 'app-ingredient-field', template: '' })
class IngredientFieldStubComponent {
    readonly foodstuffs = input.required<Foodstuff[]>();
    readonly index = input.required<number>();
}

describe('RecipeIngredientsFormComponent', () => {
    let fixture: ComponentFixture<RecipeIngredientsFormComponent>;

    const foodstuff: Foodstuff = {
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

        await TestBed.configureTestingModule({
            imports: [RecipeIngredientsFormComponent],
            providers: [
                { provide: FormGroupDirective, useValue: { control: recipeForm } },
                { provide: MatDialog, useValue: { open: vi.fn().mockName('open') } },
            ],
        })
            .overrideComponent(RecipeIngredientsFormComponent, {
            remove: {
                imports: [
                    MacroChartComponent,
                    ChartLegendElementComponent,
                    IngredientFieldComponent,
                ],
            },
            add: {
                imports: [
                    MacroChartStubComponent,
                    ChartLegendElementStubComponent,
                    IngredientFieldStubComponent,
                ],
            },
        })
            .compileComponents();

        fixture = TestBed.createComponent(RecipeIngredientsFormComponent);
        fixture.componentRef.setInput('foodstuffs', [foodstuff]);
        fixture.detectChanges();
    });

    it('shows the complete legend beside the chart without a disclosure', () => {
        fixture.componentInstance.legend.set({
            carbs: legendElement('Kohlenhydrate'),
            protein: legendElement('Eiweiß'),
            fat: legendElement('Fett'),
        });
        fixture.detectChanges();

        expect(getLegend()?.querySelectorAll('app-chart-legend-element').length).toBe(3);
        expect(getChartArea().querySelector('app-macro-chart')).not.toBeNull();
        expect(getChartArea().querySelector('.legend')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.details-button')).toBeNull();
    });

    it('does not offer a legend when every macro is zero', () => {
        fixture.componentRef.setInput('foodstuffs', [
            { ...foodstuff, carbs: 0, protein: 0, fat: 0 },
        ]);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-macro-chart')).not.toBeNull();
        expect(getLegend()).toBeNull();
    });

    it('keeps nutrition visible when a new ingredient has no foodstuff yet', () => {
        fixture.componentInstance.addIngredient();
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-macro-chart')).not.toBeNull();
        expect(getNutritionMessage()).toBeNull();
    });

    it('allows removing the last ingredient row', () => {
        fixture.componentInstance.removeIngredient(0);

        expect(fixture.componentInstance.ingredients.length).toBe(0);
    });

    it('keeps ingredient indexes unique and sequential after adding and removing rows', () => {
        fixture.componentInstance.addIngredient();
        fixture.componentInstance.addIngredient();

        expect(ingredientIndexes()).toEqual([1, 2, 3]);

        fixture.componentInstance.removeIngredient(1);
        fixture.componentInstance.addIngredient();

        expect(ingredientIndexes()).toEqual([1, 2, 3]);
    });

    it('keeps the last valid chart while a focused numeric field is invalid', () => {
        const servingsInput = fixture.nativeElement.querySelector('input[formControlName="servings"]') as HTMLInputElement;
        servingsInput.focus();
        fixture.componentInstance.ingredientsFormGroup
            .get('servings')
            ?.setValue(null);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-macro-chart')).not.toBeNull();
        expect(getNutritionMessage()).toBeNull();

        fixture.componentInstance.ingredientsFormGroup
            .get('servings')
            ?.setValue(4);
        fixture.detectChanges();

        expect(fixture.componentInstance.displayedNutritionState()).toEqual({
            status: 'complete',
            nutrition: { kcal: 92.5, carbs: 15, protein: 3.25, fat: 1.75 },
        });

        fixture.componentInstance.ingredientsFormGroup
            .get('servings')
            ?.setValue(null);
        fixture.detectChanges();

        servingsInput.blur();
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-macro-chart')).toBeNull();
        expect(getNutritionMessage()?.textContent).toContain('Nährwerte werden angezeigt, sobald Mengen und Portionen gültig sind.');

        servingsInput.focus();
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-macro-chart')).toBeNull();
        expect(getNutritionMessage()?.textContent).toContain('Nährwerte werden angezeigt, sobald Mengen und Portionen gültig sind.');
    });

    it('shows incomplete nutrition immediately for valid foodstuff data', () => {
        fixture.componentRef.setInput('foodstuffs', [
            { ...foodstuff, protein: null },
        ]);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-macro-chart')).toBeNull();
        expect(getNutritionMessage()?.textContent).toContain('Nährwertangaben der einzelnen Zutaten unvollständig.');
    });

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

function legendElement(displayName: string): ChartLegendElement {
    return { displayName, color: '#ffffff', valuePercentage: 33, valueAbsolute: 10 };
}

function createRecipeForm(): FormGroup {
    return new FormGroup({
        ingredientsFormGroup: new FormGroup({
            servings: new FormControl(2),
            ingredients: new FormArray([
                new FormGroup({
                    index: new FormControl(1),
                    foodstuffId: new FormControl(1),
                    amount: new FormControl(100),
                }),
            ]),
        }),
    });
}
