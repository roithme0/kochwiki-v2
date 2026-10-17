import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FoodstuffOut } from '../../../core/api/generated';
import { FoodstuffsSearchComponent } from './foodstuffs-search.component';

const foodstuffs: FoodstuffOut[] = [
  { id: 1, name: 'Pasta', brand: 'Barilla', unit: 'G', unitVerbose: 'Gramm', kcal: null, carbs: null, protein: null, fat: null, recipeVersionIds: [] },
  { id: 2, name: 'Reis', brand: null, unit: 'G', unitVerbose: 'Gramm', kcal: null, carbs: null, protein: null, fat: null, recipeVersionIds: [] },
];

@Component({
  imports: [FoodstuffsSearchComponent],
  template: `
    <app-foodstuffs-search [foodstuffs]="foodstuffs" [searchValue]="query()" (searchValueChange)="query.set($event)" />
    <app-foodstuffs-search [foodstuffs]="foodstuffs" [searchValue]="otherQuery()" (searchValueChange)="otherQuery.set($event)" />
  `,
})
class SearchHostComponent {
  readonly foodstuffs = foodstuffs;
  readonly query = signal('');
  readonly otherQuery = signal('Reis');
}

describe('FoodstuffsSearchComponent', () => {
  it('supports caller-owned queries, typing and clearing without sharing state between instances', async () => {
    const fixture = TestBed.createComponent(SearchHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const inputs = element.querySelectorAll<HTMLInputElement>('input');
    const input = inputs[0];

    expect(inputs[1].value).toBe('Reis');
    input.value = 'PA';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.query()).toBe('PA');
    expect(inputs[1].value).toBe('Reis');

    const clear = element.querySelector<HTMLButtonElement>('button[aria-label="Suche löschen"]');
    expect(clear).not.toBeNull();
    clear?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.query()).toBe('');
    expect(input.value).toBe('');
    expect(fixture.componentInstance.otherQuery()).toBe('Reis');

    fixture.componentInstance.query.set('externally supplied');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('externally supplied');
  });

  it('emits selected autocomplete names and brands to the caller', async () => {
    const fixture = TestBed.createComponent(SearchHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const input = element.querySelector<HTMLInputElement>('input');
    if (!input) throw new Error('Search input missing');

    for (const [query, suggestion] of [['pas', 'Pasta'], ['bAr', 'Barilla']]) {
      input.focus();
      input.value = query;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
      const options = Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
      const option = options.find((item) => item.textContent?.trim() === suggestion);
      expect(option).toBeDefined();
      option?.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.componentInstance.query()).toBe(suggestion);
      expect(input.value).toBe(suggestion);
      expect(fixture.componentInstance.otherQuery()).toBe('Reis');
    }
  });
});
