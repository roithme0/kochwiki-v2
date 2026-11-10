import { TestBed } from '@angular/core/testing';
import { page, userEvent } from 'vitest/browser';
import { foodstuffSummary } from '../../../testing/foodstuff.fixtures';
import { recipePresentation } from '../../../testing/recipe.fixtures';
import { FoodstuffImageService } from '../../../foodstuffs/services/foodstuff-image.service';
import { IngredientsCardComponent } from './ingredients-card.component';

describe('Ingredient list layout', () => {
  it.each([280, 640])(
    'keeps text and quantities within rows at %i px',
    async (width) => {
      await page.viewport(800, 800);
      TestBed.configureTestingModule({
        imports: [IngredientsCardComponent],
        providers: [{ provide: FoodstuffImageService, useValue: {} }],
      });
      const fixture = TestBed.createComponent(IngredientsCardComponent);
      const detailsText =
        '<b>literal details that must remain complete and not become markup</b>';
      const brandText =
        'A very long brand name repeated to force independent truncation '.repeat(
          4,
        );
      const unit = 'extraordinarilylongunit'.repeat(8);
      fixture.componentRef.setInput(
        'recipe',
        recipePresentation({
          ingredients: [
            {
              index: 1,
              amount: 200,
              foodstuff: foodstuffSummary({
                name: 'A very long ingredient name '.repeat(8),
                details: detailsText,
                brand: brandText,
              }),
            },
            {
              index: 2,
              amount: 400,
              foodstuff: foodstuffSummary({
                name: 'Pepper',
                unitVerbose: unit,
              }),
            },
          ],
        }),
      );
      const host = fixture.nativeElement as HTMLElement;
      host.style.display = 'block';
      host.style.width = `${width}px`;
      fixture.detectChanges();
      await fixture.whenStable();
      const list = host.querySelector<HTMLElement>('mat-action-list');
      const rows = host.querySelectorAll<HTMLButtonElement>('button.foodstuff');
      const primary = host.querySelector<HTMLElement>('.foodstuff-primary');
      const details = host.querySelector<HTMLElement>('.foodstuff-details');
      const brand = host.querySelector<HTMLElement>('.foodstuff-brand');
      if (!list || rows.length !== 2 || !primary || !details || !brand)
        throw new Error('Expected ingredient rows');
      expect(list.getAttribute('aria-label')).toBe('Zutaten');
      const disabledDisplay = rows[0].querySelector<HTMLElement>(
        'app-foodstuff-display',
      )!;
      expect(getComputedStyle(disabledDisplay).paddingTop).toBe('8px');
      expect(getComputedStyle(disabledDisplay).paddingBottom).toBe('8px');
      expect(getComputedStyle(disabledDisplay).opacity).toBe('1');
      expect(
        getComputedStyle(
          rows[0].querySelector<HTMLElement>('app-display-image')!,
        ).opacity,
      ).toBe('1');
      let clicks = 0;
      rows[0].addEventListener('click', () => clicks++);
      rows[0].focus();
      expect(document.activeElement).not.toBe(rows[0]);
      rows[0].click();
      await userEvent.keyboard('{Enter} ');
      expect(clicks).toBe(0);

      expect(details.textContent).toBe(detailsText);
      expect(details.querySelector('b')).toBeNull();
      expect(brand.textContent).toBe(brandText);
      expect(getComputedStyle(details).color).not.toBe(
        getComputedStyle(host.querySelector<HTMLElement>('.foodstuff-name')!)
          .color,
      );
      for (const text of [primary, brand]) {
        expect(getComputedStyle(text).whiteSpace).toBe('nowrap');
        expect(getComputedStyle(text).textOverflow).toBe('ellipsis');
        expect(text.scrollWidth).toBeGreaterThan(text.clientWidth);
      }
      expect(host.querySelector('[title], mat-tooltip')).toBeNull();
      for (const row of rows) {
        const image = row.querySelector<HTMLElement>('app-display-image');
        const amount = row.querySelector<HTMLElement>('.amount');
        if (!image || !amount) throw new Error('Expected image and amount');
        expect(row.disabled).toBe(true);
        expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(64);
        expect(image.getBoundingClientRect().width).toBeCloseTo(40, 0);
        expect(image.getBoundingClientRect().height).toBeCloseTo(40, 0);
        expect(amount.getBoundingClientRect().right).toBeLessThanOrEqual(
          row.getBoundingClientRect().right,
        );
        expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
      }
      expect(rows[0].querySelector('.amount')?.textContent).toContain('200');
      expect(rows[1].querySelector('.amount')?.textContent).toContain(unit);
      expect(
        rows[1].querySelector<HTMLElement>('.amount')!.getBoundingClientRect()
          .height,
      ).toBeGreaterThan(
        rows[0].querySelector<HTMLElement>('.amount')!.getBoundingClientRect()
          .height,
      );
      expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
      fixture.destroy();
    },
  );
});
