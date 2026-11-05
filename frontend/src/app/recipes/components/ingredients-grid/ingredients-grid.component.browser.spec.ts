import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { foodstuffSummary } from '../../../testing/foodstuff.fixtures';
import { recipePresentation } from '../../../testing/recipe.fixtures';
import { FoodstuffImageService } from '../../../foodstuffs/services/foodstuff-image.service';
import { IngredientsGridComponent } from './ingredients-grid.component';

describe('Ingredient name and details layout', () => {
  it.each([280, 640])(
    'wraps names and details without overflowing at %i px',
    async (width) => {
      await page.viewport(800, 800);
      TestBed.configureTestingModule({
        imports: [IngredientsGridComponent],
        providers: [{ provide: FoodstuffImageService, useValue: {} }],
      });
      const fixture = TestBed.createComponent(IngredientsGridComponent);
      fixture.componentRef.setInput(
        'recipe',
        recipePresentation({
          ingredients: [
            {
              index: 1,
              amount: 200,
              foodstuff: foodstuffSummary({
                name: 'Kartoffeln',
                details:
                  'geschält, roh und mit sehr langen beschreibenden Angaben für den Zeilenumbruch',
              }),
            },
            {
              index: 2,
              amount: 400,
              foodstuff: foodstuffSummary({
                name: 'Hirtenkäse 45% Fett i. Tr.',
              }),
            },
            {
              index: 3,
              amount: 82.5,
              foodstuff: foodstuffSummary({
                name: 'Pfefferonen',
                details: '<b>grün, scharf</b>',
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
      const grid = host.querySelector<HTMLElement>('.grid');
      const names = host.querySelectorAll<HTMLElement>('.foodstuff-name');
      const details = host.querySelectorAll<HTMLElement>('.foodstuff-details');
      const amounts = host.querySelectorAll<HTMLElement>('.amount');
      if (!grid || !names[0] || !details[0] || !amounts[0])
        throw new Error('Expected ingredient rows');
      expect(details).toHaveLength(2);
      expect(details[0].parentElement).toBe(names[0].parentElement);
      expect(details[0].getBoundingClientRect().right).toBeLessThan(
        amounts[0].getBoundingClientRect().left,
      );
      expect(getComputedStyle(details[0]).color).not.toBe(
        getComputedStyle(names[0]).color,
      );
      expect(grid.scrollWidth).toBeLessThanOrEqual(grid.clientWidth);
      expect(details[1].textContent).toBe('<b>grün, scharf</b>');
      expect(details[1].querySelector('b')).toBeNull();
      fixture.destroy();
    },
  );
});
