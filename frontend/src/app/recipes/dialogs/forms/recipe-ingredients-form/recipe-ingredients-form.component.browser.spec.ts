import { Component, input } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import {
  FormArray,
  FormControl,
  FormGroup,
  FormGroupDirective,
} from '@angular/forms';
import type { FoodstuffSummaryOut } from '../../../../core/api/generated';
import { foodstuffSummary } from '../../../../testing/foodstuff.fixtures';
import { IngredientFieldComponent } from './ingredient-field/ingredient-field.component';
import { RecipeIngredientsFormComponent } from './recipe-ingredients-form.component';

@Component({ selector: 'app-ingredient-field', template: '' })
class IngredientFieldStubComponent {
  readonly foodstuff = input.required<FoodstuffSummaryOut | undefined>();
  readonly amountControl = input.required<FormControl<number | null>>();
  readonly index = input.required<number>();
}

describe('RecipeIngredientsFormComponent nutrition preview layout', () => {
  let fixture: ComponentFixture<RecipeIngredientsFormComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    const form = new FormGroup({
      ingredientsFormGroup: new FormGroup({
        servings: new FormControl(2),
        ingredients: new FormArray([]),
      }),
    });
    TestBed.configureTestingModule({
      imports: [RecipeIngredientsFormComponent],
      providers: [{ provide: FormGroupDirective, useValue: { control: form } }],
    }).overrideComponent(RecipeIngredientsFormComponent, {
      remove: { imports: [IngredientFieldComponent] },
      add: { imports: [IngredientFieldStubComponent] },
    });
    fixture = TestBed.createComponent(RecipeIngredientsFormComponent);
    host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    fixture.detectChanges();
    fixture.componentInstance.addIngredient(
      foodstuffSummary({
        kcal: 330,
        carbs: 40,
        protein: 20,
        fat: 10,
        fiber: 8,
      }),
      100,
    );
  });

  afterEach(() => fixture.destroy());

  it.each([320, 400, 640])(
    'spans the separator and fiber beneath chart and macros at %i px',
    async (width) => {
      host.style.width = `${width}px`;
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const preview = host.querySelector<HTMLElement>('.nutrition-preview');
      const chart = preview?.querySelector<HTMLElement>('app-macro-chart');
      const legend = preview?.querySelector<HTMLElement>('.legend');
      const separator = preview?.querySelector<HTMLElement>(':scope > hr');
      const fiber = preview?.querySelector<HTMLElement>(
        ':scope > app-nutrition-value',
      );
      if (!preview || !chart || !legend || !separator || !fiber)
        throw new Error('Expected complete nutrition preview');
      expect(legend.querySelectorAll('app-chart-legend-element')).toHaveLength(
        3,
      );
      expect(legend.querySelector('app-nutrition-value')).toBeNull();
      expect(fiber.textContent).toContain('Ballaststoffe');
      expect(fiber.querySelector('.value-absolute')?.textContent?.trim()).toBe(
        '4\u00a0g',
      );

      const chartBounds = chart.getBoundingClientRect();
      const legendBounds = legend.getBoundingClientRect();
      const separatorBounds = separator.getBoundingClientRect();
      const fiberBounds = fiber.getBoundingClientRect();
      const previewBounds = preview.getBoundingClientRect();
      expect(chartBounds.right).toBeLessThanOrEqual(legendBounds.left);
      expect(Math.max(chartBounds.top, legendBounds.top)).toBeLessThan(
        Math.min(chartBounds.bottom, legendBounds.bottom),
      );
      expect(separatorBounds.top).toBeGreaterThan(
        Math.max(chartBounds.bottom, legendBounds.bottom),
      );
      expect(fiberBounds.top).toBeGreaterThan(separatorBounds.bottom);
      for (const bounds of [separatorBounds, fiberBounds]) {
        expect(bounds.left).toBe(previewBounds.left);
        expect(bounds.right).toBe(previewBounds.right);
      }
      for (const value of preview.querySelectorAll<HTMLElement>(
        '.value-percentage, .value-absolute',
      )) {
        const bounds = value.getBoundingClientRect();
        expect(bounds.left).toBeGreaterThanOrEqual(previewBounds.left);
        expect(bounds.right).toBeLessThanOrEqual(previewBounds.right);
        expect(value.scrollWidth).toBeLessThanOrEqual(value.clientWidth);
      }
    },
  );
});
