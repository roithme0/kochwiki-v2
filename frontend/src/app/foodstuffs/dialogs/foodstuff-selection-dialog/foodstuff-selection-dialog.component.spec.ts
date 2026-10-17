import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import type { FoodstuffOut } from '../../../core/api/generated';
import { FoodstuffsSearchComponent } from '../../components/foodstuffs-search/foodstuffs-search.component';
import { FoodstuffSelectionDialogComponent } from './foodstuff-selection-dialog.component';

const foodstuffs: FoodstuffOut[] = [
  { id: 1, name: 'Pasta', brand: 'Barilla', unit: 'G', unitVerbose: 'Gramm', kcal: null, carbs: null, protein: null, fat: null, recipeVersionIds: [] },
  { id: 2, name: 'Olivenöl', brand: null, unit: 'ML', unitVerbose: 'Milliliter', kcal: null, carbs: null, protein: null, fat: null, recipeVersionIds: [] },
];

describe('FoodstuffSelectionDialogComponent', () => {
  it('shows all foodstuffs, filters by name or brand, and restores the list when cleared', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { foodstuffs } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const names = (): string[] => Array.from(element.querySelectorAll('.foodstuff-name'))
      .map((item) => item.textContent?.trim() ?? '');
    const search = fixture.debugElement.query(By.directive(FoodstuffsSearchComponent))
      .componentInstance as FoodstuffsSearchComponent;

    expect(names()).toEqual(['Pasta', 'Olivenöl']);
    expect(element.querySelectorAll('mat-list-item img').length).toBe(2);

    for (const query of ['pAs', 'bAR']) {
      search.searchValueChange.emit(query);
      fixture.detectChanges();
      expect(names()).toEqual(['Pasta']);
    }

    search.searchValueChange.emit('missing');
    fixture.detectChanges();
    expect(names()).toEqual([]);
    expect(element.textContent).toContain('Keine Lebensmittel gefunden.');

    const clearButton = element.querySelector<HTMLButtonElement>('.empty-state button');
    expect(clearButton).not.toBeNull();
    clearButton?.click();
    fixture.detectChanges();
    expect(names()).toEqual(['Pasta', 'Olivenöl']);
    expect(foodstuffs.length).toBe(2);
  });
});
