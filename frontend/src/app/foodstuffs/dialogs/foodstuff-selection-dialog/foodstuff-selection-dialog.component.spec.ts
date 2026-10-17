import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { FoodstuffOut } from '../../../core/api/generated';
import { FoodstuffsSearchComponent } from '../../components/foodstuffs-search/foodstuffs-search.component';
import { FoodstuffSelectionDialogComponent } from './foodstuff-selection-dialog.component';

const foodstuffs: FoodstuffOut[] = [
  { id: 1, name: 'Pasta', brand: 'Barilla', unit: 'G', unitVerbose: 'Gramm', kcal: null, carbs: null, protein: null, fat: null, recipeVersionIds: [] },
  { id: 2, name: 'Olivenöl', brand: null, unit: 'ML', unitVerbose: 'Milliliter', kcal: null, carbs: null, protein: null, fat: null, recipeVersionIds: [] },
];

describe('FoodstuffSelectionDialogComponent', () => {
  const close = vi.fn();
  beforeEach(() => {
    close.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: MatDialogRef, useValue: { close } }] });
  });
  it('shows all foodstuffs, filters by name or brand, and restores the list when cleared', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { foodstuffs, existingFoodstuffIds: [] } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const names = (): string[] => Array.from(element.querySelectorAll('.foodstuff-name'))
      .map((item) => item.textContent?.trim() ?? '');
    const search = fixture.debugElement.query(By.directive(FoodstuffsSearchComponent))
      .componentInstance as FoodstuffsSearchComponent;

    expect(names()).toEqual(['Pasta', 'Olivenöl']);
    expect(element.querySelectorAll('button[mat-list-item] img').length).toBe(2);

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

  it('confirms in selection order, including filtered-out items, and rejects empty confirmation', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { foodstuffs, existingFoodstuffIds: [] } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const confirm = element.querySelector<HTMLButtonElement>('.basket-summary button');
    expect(confirm?.disabled).toBe(true);
    expect(element.querySelector('.basket-preview')).toBeNull();
    fixture.componentInstance.confirmSelection();
    expect(close).not.toHaveBeenCalled();
    fixture.componentInstance.toggleFoodstuff(2);
    fixture.componentInstance.toggleFoodstuff(1);
    fixture.componentInstance.searchValue.set('missing');
    fixture.detectChanges();
    expect(confirm?.disabled).toBe(false);
    expect(Array.from(element.querySelectorAll<HTMLImageElement>('.basket-preview img'))
      .map((image) => image.alt)).toEqual(['Olivenöl', 'Pasta · Barilla']);
    expect(element.querySelector('.basket-preview button, .basket-preview a, .basket-preview [tabindex]')).toBeNull();
    confirm?.click();
    expect(close).toHaveBeenCalledWith([2, 1]);
  });

  it('preserves selections across filtering, toggles them, and blocks existing ingredients', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: {
        foodstuffs: [...foodstuffs, { ...foodstuffs[0], id: 3, brand: 'Andere Marke' }],
        existingFoodstuffIds: [2],
      } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const buttons = (): HTMLButtonElement[] => Array.from(element.querySelectorAll('button[mat-list-item]'));

    expect(buttons()[1].disabled).toBe(true);
    expect(buttons()[1].textContent).toContain('Bereits hinzugefügt');
    buttons()[1].click();
    buttons()[0].click();
    buttons()[2].click();
    fixture.detectChanges();
    expect(buttons()[0].getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('.selection-count')?.textContent).toContain('2');

    fixture.componentInstance.searchValue.set('missing');
    fixture.detectChanges();
    expect(buttons()).toHaveLength(0);
    fixture.componentInstance.searchValue.set('');
    fixture.detectChanges();
    expect(buttons()[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons()[2].getAttribute('aria-pressed')).toBe('true');
    expect(buttons()[0].textContent).toContain('Im Korb');

    buttons()[0].click();
    fixture.detectChanges();
    expect(buttons()[0].getAttribute('aria-pressed')).toBe('false');
    expect(element.querySelector('.selection-count')?.textContent).toContain('1');
    expect(element.querySelector<HTMLImageElement>('.basket-preview img')?.alt).toBe('Pasta · Andere Marke');
    buttons()[2].click();
    fixture.detectChanges();
    expect(element.querySelector('.selection-count')?.textContent).toContain('0');
    expect(element.querySelector('.basket-preview')).toBeNull();
  });
});
