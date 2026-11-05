import { foodstuffOut } from '../../../testing/foodstuff.fixtures';
import type { Mock } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogData } from '../../../core/dialogs/confirmation-dialog/confirmation-dialog.component';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import type { FoodstuffOut } from '../../../core/api/generated';
import { FoodstuffUnit } from '../../models/foodstuff-unit';
import { FoodstuffsTableComponent } from './foodstuffs-table.component';
import { FoodstuffTableControlService } from '../../services/foodstuff-table-control.service';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';

describe('FoodstuffsTableComponent', () => {
  const foodstuff: FoodstuffOut = foodstuffOut({
    id: 42,
    name: 'Tomate',
    unit: FoodstuffUnit.Gram,
    unitVerbose: 'Gramm',
    kcal: 18,
    carbs: 3,
    protein: 1,
    fat: 0,
  });

  let component: FoodstuffsTableComponent;
  let openDialog: Mock;
  let deleteFoodstuff: Mock;
  let notifyFoodstuffsChanged: Mock;
  let openSnackBar: Mock;

  beforeEach(() => {
    openDialog = vi.fn().mockName('open');
    deleteFoodstuff = vi.fn().mockName('deleteFoodstuff');
    notifyFoodstuffsChanged = vi.fn().mockName('notifyFoodstuffsChanged');
    openSnackBar = vi.fn().mockName('open');

    TestBed.configureTestingModule({
      providers: [
        {
          provide: FoodstuffImageService,
          useValue: {
            download: vi
              .fn()
              .mockResolvedValue({ url: '/storage/tomato', expiresIn: 300 }),
          },
        },
        {
          provide: FoodstuffTableControlService,
          useValue: { searchBy: signal('') },
        },
        { provide: MatDialog, useValue: { open: openDialog } },
        {
          provide: FoodstuffBackendService,
          useValue: { deleteFoodstuff, notifyFoodstuffsChanged },
        },
        { provide: SnackBarService, useValue: { open: openSnackBar } },
      ],
    });
    component = TestBed.runInInjectionContext(
      () => new FoodstuffsTableComponent(),
    );
  });

  it('disconnects the resize observer when destroyed', () => {
    const resizeObserver = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn().mockName('ResizeObserver.disconnect'),
    };
    component.tableWrapperResizeObserver = resizeObserver;

    component.ngOnDestroy();

    expect(resizeObserver.disconnect).toHaveBeenCalledTimes(1);

    expect(resizeObserver.disconnect).toHaveBeenCalledWith();
  });

  it('renders only the primary display and row actions', () => {
    const fixture = TestBed.createComponent(FoodstuffsTableComponent);
    fixture.componentRef.setInput('foodstuffs', [
      { ...foodstuff, details: 'reif', brand: 'Farm' },
    ]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('th')).toHaveLength(3);
    expect(element.querySelector('th')?.textContent?.trim()).toBe('Name');
    expect(
      element.querySelector('.mat-column-primary .foodstuff-name')?.textContent,
    ).toBe('Tomate');
    expect(
      element.querySelector('.mat-column-primary .foodstuff-details')
        ?.textContent,
    ).toBe('reif');
    expect(element.querySelector('td.mat-column-edit button')).not.toBeNull();
    expect(element.querySelector('td.mat-column-delete button')).not.toBeNull();
    expect(
      element.querySelector(
        '.mat-column-brand, .mat-column-kcal, .mat-column-unit',
      ),
    ).toBeNull();
  });

  it('sorts the primary column by foodstuff name', async () => {
    const fixture = TestBed.createComponent(FoodstuffsTableComponent);
    fixture.componentRef.setInput('foodstuffs', [
      foodstuff,
      { ...foodstuff, id: 43, name: 'Apfel' },
    ]);
    fixture.detectChanges();
    Object.defineProperty(
      fixture.componentInstance.tableWrapper.nativeElement,
      'offsetHeight',
      { get: () => 246 },
    );
    fixture.componentInstance.contentChanged();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const header = element.querySelector<HTMLElement>('th.mat-column-primary');
    if (!header) throw new Error('Expected primary column header');
    header.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      Array.from(
        element.querySelectorAll('tbody .foodstuff-name'),
        (name) => name.textContent,
      ),
    ).toEqual(['Apfel', 'Tomate']);
    header.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      Array.from(
        element.querySelectorAll('tbody .foodstuff-name'),
        (name) => name.textContent,
      ),
    ).toEqual(['Tomate', 'Apfel']);
  });

  it('renders the catalogue image in the primary column', async () => {
    const download = vi.spyOn(
      TestBed.inject(FoodstuffImageService),
      'download',
    );
    const fixture = TestBed.createComponent(FoodstuffsTableComponent);
    fixture.componentRef.setInput('foodstuffs', [
      { ...foodstuff, imageId: 'tomato-image' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-macro-chart')).toBeNull();
    expect(
      element.querySelector('.mat-column-primary app-foodstuff-image'),
    ).not.toBeNull();
    expect(download).toHaveBeenCalledWith('tomato-image');
    const image = element.querySelector<HTMLImageElement>(
      'img[src="/storage/tomato"]',
    )!;
    image.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(image.style.visibility).toBe('visible');
    expect(element.textContent).toContain('Tomate');
  });

  it('adjusts pagination to the available height while keeping the current item in view', async () => {
    const fixture = TestBed.createComponent(FoodstuffsTableComponent);
    fixture.componentRef.setInput(
      'foodstuffs',
      Array.from({ length: 30 }, (_, id) => ({ ...foodstuff, id })),
    );
    fixture.detectChanges();
    const table = fixture.componentInstance;
    let height = 246;
    Object.defineProperty(table.tableWrapper.nativeElement, 'offsetHeight', {
      get: () => height,
    });

    table.contentChanged();
    await vi.waitFor(() => expect(table.paginator.pageSize).toBe(5));
    table.paginator.pageIndex = 2;
    height = 174;
    table.contentChanged();

    await vi.waitFor(() => expect(table.paginator.pageSize).toBe(3));
    expect(table.paginator.pageIndex).toBe(3);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    ).toHaveLength(3);
  });

  it('uses one row rather than overflowing with twelve when space is tight', async () => {
    const fixture = TestBed.createComponent(FoodstuffsTableComponent);
    fixture.componentRef.setInput(
      'foodstuffs',
      Array.from({ length: 20 }, (_, id) => ({ ...foodstuff, id })),
    );
    fixture.detectChanges();
    const table = fixture.componentInstance;
    Object.defineProperty(table.tableWrapper.nativeElement, 'offsetHeight', {
      get: () => 80,
    });

    table.contentChanged();

    await vi.waitFor(() => expect(table.paginator.pageSize).toBe(1));
    expect(table.paginator.hasNextPage()).toBe(true);
  });

  it('executes the foodstuff deletion and success side effects through the dialog action', async () => {
    deleteFoodstuff.mockResolvedValue(undefined);

    const action: () => Promise<void> = openConfirmationAction();
    await action();

    expect(deleteFoodstuff).toHaveBeenCalledWith(foodstuff.id);
    expect(notifyFoodstuffsChanged).toHaveBeenCalledTimes(1);
    expect(openSnackBar).toHaveBeenCalledWith('Zutat gelöscht');
  });

  it('shows the existing error snackbar and rejects so the dialog remains open', async () => {
    const error = new Error('failed');
    deleteFoodstuff.mockRejectedValue(error);
    vi.spyOn(console, 'error').mockReturnValue(undefined);

    const action: () => Promise<void> = openConfirmationAction();

    await expect(action()).rejects.toEqual(error);

    expect(notifyFoodstuffsChanged).not.toHaveBeenCalled();
    expect(openSnackBar).toHaveBeenCalledWith(
      'Zutat konnte nicht gelöscht werden',
    );
  });

  function openConfirmationAction(): () => Promise<void> {
    component.openDeleteFoodstuffDialog(foodstuff);
    const config = vi.mocked(openDialog).mock.lastCall![1] as {
      data: ConfirmationDialogData;
    };
    return config.data.action;
  }
});
