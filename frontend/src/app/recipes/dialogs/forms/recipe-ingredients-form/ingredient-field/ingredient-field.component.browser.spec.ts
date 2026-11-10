import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { page } from 'vitest/browser';
import { FoodstuffImageService } from '../../../../../foodstuffs/services/foodstuff-image.service';
import { foodstuffSummary } from '../../../../../testing/foodstuff.fixtures';
import { IngredientFieldComponent } from './ingredient-field.component';

describe('IngredientFieldComponent layout', () => {
  it.each([280, 640])(
    'keeps the amount usable beside truncated text at %i px',
    async (width) => {
      await page.viewport(800, 800);
      TestBed.configureTestingModule({
        imports: [IngredientFieldComponent],
        providers: [{ provide: FoodstuffImageService, useValue: {} }],
      });
      const fixture = TestBed.createComponent(IngredientFieldComponent);
      const details = '<b>literal details</b> '.repeat(10);
      const brand = 'An independently truncated brand '.repeat(10);
      fixture.componentRef.setInput(
        'foodstuff',
        foodstuffSummary({
          name: 'Long ingredient name '.repeat(10),
          details,
          brand,
        }),
      );
      const control = new FormControl<number | null>(123);
      fixture.componentRef.setInput('amountControl', control);
      fixture.componentRef.setInput('index', 0);
      const host = fixture.nativeElement as HTMLElement;
      host.style.width = `${width}px`;
      fixture.detectChanges();
      await fixture.whenStable();
      const primary = host.querySelector<HTMLElement>('.foodstuff-primary');
      const brandElement = host.querySelector<HTMLElement>('.foodstuff-brand');
      const image = host.querySelector<HTMLElement>('app-display-image');
      const input = host.querySelector<HTMLInputElement>('input[type=number]');
      const fields = host.querySelector<HTMLElement>('.ingredient-fields');
      if (!primary || !brandElement || !image || !input || !fields)
        throw new Error('Expected ingredient field');
      expect(host.querySelector('.foodstuff-details')?.textContent).toBe(
        details,
      );
      expect(host.querySelector('.foodstuff-details b')).toBeNull();
      expect(brandElement.textContent).toBe(brand);
      for (const text of [primary, brandElement]) {
        expect(getComputedStyle(text).textOverflow).toBe('ellipsis');
        expect(getComputedStyle(text).whiteSpace).toBe('nowrap');
        expect(text.scrollWidth).toBeGreaterThan(text.clientWidth);
      }
      expect(image.getBoundingClientRect().width).toBeCloseTo(32, 0);
      expect(image.getBoundingClientRect().height).toBeCloseTo(32, 0);
      expect(fields.scrollWidth).toBeLessThanOrEqual(fields.clientWidth);
      expect(input.getBoundingClientRect().width).toBeGreaterThan(0);
      input.value = '456';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(control.value).toBe(456);
      fixture.destroy();
    },
  );
});
