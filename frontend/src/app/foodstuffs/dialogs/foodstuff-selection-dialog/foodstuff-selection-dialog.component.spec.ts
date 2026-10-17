import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { Subject } from 'rxjs';
import { FoodstuffCreateDialogComponent } from '../foodstuff-create-dialog/foodstuff-create-dialog.component';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import type { FoodstuffOut } from '../../../core/api/generated';
import { FoodstuffsSearchComponent } from '../../components/foodstuffs-search/foodstuffs-search.component';
import { FoodstuffSelectionDialogComponent } from './foodstuff-selection-dialog.component';

const foodstuffs: FoodstuffOut[] = [
  { id: 1, name: 'Pasta', brand: 'Barilla', unit: 'G', unitVerbose: 'Gramm', kcal: null, carbs: null, protein: null, fat: null, recipeVersionIds: [] },
  { id: 2, name: 'Olivenöl', brand: null, unit: 'ML', unitVerbose: 'Milliliter', kcal: null, carbs: null, protein: null, fat: null, recipeVersionIds: [] },
];

describe('FoodstuffSelectionDialogComponent', () => {
  const close = vi.fn();
  let creationResult: Subject<FoodstuffOut | undefined>;
  const open = vi.fn();
  const getAllFoodstuffs = vi.fn();
  let foodstuffsChanged: Subject<void>;
  beforeEach(() => {
    close.mockReset();
    foodstuffsChanged = new Subject<void>();
    getAllFoodstuffs.mockReset().mockResolvedValue([...foodstuffs].reverse());
    creationResult = new Subject<FoodstuffOut | undefined>();
    open.mockReset().mockReturnValue({ afterClosed: () => creationResult.asObservable() });
    TestBed.configureTestingModule({ providers: [{ provide: MatDialogRef, useValue: { close } }, { provide: FoodstuffBackendService, useValue: { getAllFoodstuffs, foodstuffsChanged$: foodstuffsChanged } }] });
    TestBed.overrideComponent(FoodstuffSelectionDialogComponent, {
      add: { providers: [{ provide: MatDialog, useValue: { open } }] },
    });
  });
  it('shows loading and retries a failed catalogue request without showing a false empty result', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { existingFoodstuffIds: [] } }],
    });
    let rejectLoad!: (error: Error) => void;
    getAllFoodstuffs.mockReturnValueOnce(new Promise<FoodstuffOut[]>((_resolve, reject) => { rejectLoad = reject; }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('mat-spinner')).not.toBeNull();
      expect(element.textContent).not.toContain('Keine Lebensmittel gefunden.');
      expect(element.querySelector<HTMLButtonElement>('.create-foodstuff-button')?.disabled).toBe(true);
      rejectLoad(new Error('unavailable'));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('Lebensmittel konnten nicht geladen werden.');
      element.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(getAllFoodstuffs).toHaveBeenCalledTimes(2);
      expect(fixture.componentInstance.catalogueState()).toBe('ready');
      expect(element.querySelectorAll('button[mat-list-item]')).toHaveLength(2);
    } finally {
      error.mockRestore();
    }
  });

  it('ignores a catalogue response after the picker has been destroyed', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { existingFoodstuffIds: [] } }],
    });
    let resolveLoad!: (records: FoodstuffOut[]) => void;
    getAllFoodstuffs.mockReturnValueOnce(new Promise<FoodstuffOut[]>((resolve) => { resolveLoad = resolve; }));
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    const pending = fixture.componentInstance.loadFoodstuffs();
    fixture.destroy();
    resolveLoad(foodstuffs);
    await pending;
    expect(fixture.componentInstance.foodstuffs()).toEqual([]);
  });

  it('refreshes on catalogue changes while preserving search and pending records, then unsubscribes on close', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { existingFoodstuffIds: [] } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.toggleFoodstuff(2);
    component.toggleFoodstuff(1);
    component.searchValue.set('pasta');
    const updated = { ...foodstuffs[0], name: 'Pasta neu' };
    getAllFoodstuffs.mockResolvedValue([updated]);
    foodstuffsChanged.next();
    await fixture.whenStable();
    expect(getAllFoodstuffs).toHaveBeenCalledTimes(2);
    expect(component.foodstuffs()).toEqual([updated]);
    expect(component.searchValue()).toBe('pasta');
    expect(component.displayedFoodstuffs()).toEqual([updated]);
    expect(component.selectedFoodstuffs()).toEqual([foodstuffs[1], foodstuffs[0]]);
    component.confirmSelection();
    expect(close).toHaveBeenCalledWith([foodstuffs[1], foodstuffs[0]]);
    fixture.destroy();
    foodstuffsChanged.next();
    expect(getAllFoodstuffs).toHaveBeenCalledTimes(2);
  });

  it('keeps a newly created basket record when a delayed refresh omits it, without duplicating catalogue entries', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { existingFoodstuffIds: [] } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.toggleFoodstuff(1);
    component.searchValue.set('pasta');
    let resolveRefresh!: (records: FoodstuffOut[]) => void;
    getAllFoodstuffs.mockReturnValueOnce(new Promise<FoodstuffOut[]>((resolve) => { resolveRefresh = resolve; }));
    component.openCreateFoodstuffDialog();
    foodstuffsChanged.next();
    const created = { ...foodstuffs[0], id: 3, name: 'Reis' };
    creationResult.next(created);
    creationResult.complete();
    resolveRefresh(foodstuffs);
    await fixture.whenStable();
    expect(component.searchValue()).toBe('pasta');
    expect(component.selectedFoodstuffs()).toEqual([foodstuffs[0], created]);
    component.confirmSelection();
    expect(close).toHaveBeenCalledWith([foodstuffs[0], created]);

    creationResult = new Subject<FoodstuffOut | undefined>();
    component.openCreateFoodstuffDialog();
    getAllFoodstuffs.mockResolvedValue([...foodstuffs, created]);
    foodstuffsChanged.next();
    await fixture.whenStable();
    creationResult.next(created);
    expect(component.foodstuffs().filter((foodstuff) => foodstuff.id === created.id)).toHaveLength(1);
    expect(component.selectedFoodstuffs()).toEqual([foodstuffs[0], created]);
  });

  it('ignores superseded responses and retains pending records after a failed refresh', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { existingFoodstuffIds: [] } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.toggleFoodstuff(1);
    let resolveOlder!: (records: FoodstuffOut[]) => void;
    getAllFoodstuffs.mockReturnValueOnce(new Promise<FoodstuffOut[]>((resolve) => { resolveOlder = resolve; }));
    foodstuffsChanged.next();
    const updated = { ...foodstuffs[0], name: 'Pasta neu' };
    getAllFoodstuffs.mockResolvedValue([updated]);
    await component.loadFoodstuffs();
    resolveOlder([]);
    await fixture.whenStable();
    expect(component.foodstuffs()).toEqual([updated]);
    expect(component.catalogueState()).toBe('ready');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      getAllFoodstuffs.mockRejectedValue(new Error('unavailable'));
      foodstuffsChanged.next();
      await fixture.whenStable();
      expect(component.catalogueState()).toBe('error');
      expect(component.selectedFoodstuffs()).toEqual([foodstuffs[0]]);
      component.confirmSelection();
      expect(close).toHaveBeenCalledWith([foodstuffs[0]]);
    } finally {
      error.mockRestore();
    }
  });

  it('loads and sorts the catalogue, filters by name or brand, and restores the list when cleared', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { existingFoodstuffIds: [] } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const names = (): string[] => Array.from(element.querySelectorAll('.foodstuff-name'))
      .map((item) => item.textContent?.trim() ?? '');
    const search = fixture.debugElement.query(By.directive(FoodstuffsSearchComponent))
      .componentInstance as FoodstuffsSearchComponent;

    expect(names()).toEqual(['Olivenöl', 'Pasta']);
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
    expect(names()).toEqual(['Olivenöl', 'Pasta']);
    expect(foodstuffs.length).toBe(2);
  });

  it('confirms records in selection order, including filtered-out items, and rejects empty confirmation', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { existingFoodstuffIds: [] } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
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
    expect(close).toHaveBeenCalledWith([foodstuffs[1], foodstuffs[0]]);
  });

  it('adds a created foodstuff to the basket without changing search or existing selections', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { existingFoodstuffIds: [] } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    const created: FoodstuffOut = { ...foodstuffs[0], id: 3, name: 'Reis' };
    component.toggleFoodstuff(2);
    component.searchValue.set('pasta');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('.create-foodstuff-button')?.click();
    expect(open).toHaveBeenCalledWith(FoodstuffCreateDialogComponent, expect.any(Object));
    creationResult.next(created);
    creationResult.complete();
    fixture.detectChanges();
    expect(component.searchValue()).toBe('pasta');
    expect(component.displayedFoodstuffs()).toEqual([foodstuffs[0]]);
    expect(component.selectedFoodstuffs()).toEqual([foodstuffs[1], created]);
    expect(foodstuffs).toHaveLength(2);
    component.confirmSelection();
    expect(close).toHaveBeenCalledWith([foodstuffs[1], created]);
    component.searchValue.set('reis');
    fixture.detectChanges();
    const result = element.querySelector<HTMLButtonElement>('button[mat-list-item]');
    expect(result?.getAttribute('aria-pressed')).toBe('true');
    result?.click();
    expect(component.selectedFoodstuffs()).toEqual([foodstuffs[1]]);
  });

  it('preserves the picker when foodstuff creation is cancelled', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { existingFoodstuffIds: [] } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    component.toggleFoodstuff(1);
    component.searchValue.set('missing');
    component.openCreateFoodstuffDialog();
    creationResult.next(undefined);
    creationResult.complete();
    expect(component.searchValue()).toBe('missing');
    expect(component.selectedFoodstuffs()).toEqual([foodstuffs[0]]);
    expect(component.foodstuffs()).toEqual([foodstuffs[1], foodstuffs[0]]);
    expect(close).not.toHaveBeenCalled();
  });

  it('preserves selections across filtering, toggles them, and blocks existing ingredients', async () => {
    getAllFoodstuffs.mockResolvedValue([...foodstuffs, { ...foodstuffs[0], id: 3, brand: 'Andere Marke' }]);
    TestBed.configureTestingModule({
      providers: [{ provide: MAT_DIALOG_DATA, useValue: {
        existingFoodstuffIds: [2],
      } }],
    });
    const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const buttons = (): HTMLButtonElement[] => Array.from(element.querySelectorAll('button[mat-list-item]'));

    expect(buttons()[0].disabled).toBe(true);
    expect(buttons()[0].textContent).toContain('Bereits hinzugefügt');
    buttons()[0].click();
    buttons()[1].click();
    buttons()[2].click();
    fixture.detectChanges();
    expect(buttons()[1].getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('.selection-count')?.textContent).toContain('2');

    fixture.componentInstance.searchValue.set('missing');
    fixture.detectChanges();
    expect(buttons()).toHaveLength(0);
    fixture.componentInstance.searchValue.set('');
    fixture.detectChanges();
    expect(buttons()[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons()[2].getAttribute('aria-pressed')).toBe('true');
    expect(buttons()[1].textContent).toContain('Im Korb');

    buttons()[1].click();
    fixture.detectChanges();
    expect(buttons()[1].getAttribute('aria-pressed')).toBe('false');
    expect(element.querySelector('.selection-count')?.textContent).toContain('1');
    expect(element.querySelector<HTMLImageElement>('.basket-preview img')?.alt).toBe('Pasta · Andere Marke');
    buttons()[2].click();
    fixture.detectChanges();
    expect(element.querySelector('.selection-count')?.textContent).toContain('0');
    expect(element.querySelector('.basket-preview')).toBeNull();
  });
});
