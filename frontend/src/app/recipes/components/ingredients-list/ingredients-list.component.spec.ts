import { TestBed } from '@angular/core/testing';
import { FoodstuffImageService } from '../../../foodstuffs/services/foodstuff-image.service';
import { foodstuffSummary } from '../../../testing/foodstuff.fixtures';
import { IngredientsListComponent } from './ingredients-list.component';

describe('IngredientsListComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [IngredientsListComponent],
      providers: [{ provide: FoodstuffImageService, useValue: {} }],
    });
  });

  it('sorts a readonly input without mutation and renders disabled rows', () => {
    const ingredients = Object.freeze([
      { index: 2, amount: 3, foodstuff: foodstuffSummary({ name: 'Salz' }) },
      {
        index: 1,
        amount: 2,
        foodstuff: foodstuffSummary({ name: 'Apfel', details: '<b>roh</b>' }),
      },
    ]);
    const fixture = TestBed.createComponent(IngredientsListComponent);
    fixture.componentRef.setInput('ingredients', ingredients);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const buttons = host.querySelectorAll<HTMLButtonElement>('button');
    expect(Array.from(buttons).every((button) => button.disabled)).toBe(true);
    expect(buttons[0].textContent).toContain('Apfel');
    expect(buttons[1].textContent).toContain('Salz');
    expect(ingredients.map((ingredient) => ingredient.index)).toEqual([2, 1]);
    expect(host.querySelector('.foodstuff-details')?.textContent).toBe(
      '<b>roh</b>',
    );
    expect(host.querySelector('.foodstuff-details b')).toBeNull();
    expect(
      host.querySelector('mat-action-list')?.getAttribute('aria-label'),
    ).toBe('Zutaten');
  });

  it('renders the empty state without a row', () => {
    const fixture = TestBed.createComponent(IngredientsListComponent);
    fixture.componentRef.setInput('ingredients', []);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent?.trim()).toBe('Keine Zutaten vorhanden');
    expect(host.querySelector('button')).toBeNull();
  });
});
