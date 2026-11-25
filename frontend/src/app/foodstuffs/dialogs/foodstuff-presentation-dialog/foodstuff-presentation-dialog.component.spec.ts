import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import { TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { foodstuffOut } from '../../../testing/foodstuff.fixtures';
import { ConfirmationDialogData } from '../../../core/dialogs/confirmation-dialog/confirmation-dialog.component';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { FoodstuffPresentationDialogComponent } from './foodstuff-presentation-dialog.component';

describe('Foodstuff presentation dialog', () => {
  it.each([
    undefined,
    foodstuffOut({ name: 'Saved', details: 'fresh', brand: 'Farm', kcal: 123 }),
  ])(
    'keeps previous values on cancel and presents the persisted result on save',
    (saved) => {
      const closed = new Subject<typeof saved>();
      const open = vi.fn().mockReturnValue({ afterClosed: () => closed });
      TestBed.configureTestingModule({
        imports: [FoodstuffPresentationDialogComponent],
        providers: [
          {
            provide: MAT_DIALOG_DATA,
            useValue: {
              foodstuff: foodstuffOut({
                name: 'Original',
                details: null,
                brand: null,
              }),
              editable: true,
            },
          },
          { provide: MatDialog, useValue: { open } },
          { provide: MatDialogRef, useValue: { close: vi.fn() } },
          { provide: FoodstuffBackendService, useValue: {} },
          { provide: SnackBarService, useValue: { open: vi.fn() } },
          { provide: FoodstuffImageService, useValue: { contentUrl: vi.fn() } },
        ],
      });
      TestBed.overrideComponent(MacroChartComponent, { set: { template: '' } });
      const fixture = TestBed.createComponent(
        FoodstuffPresentationDialogComponent,
      );
      vi.spyOn(fixture.componentInstance.dialog, 'open').mockImplementation(
        open,
      );
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('h2')?.textContent).toBe('Original');
      fixture.componentInstance.activateAction('unknown');
      expect(open).not.toHaveBeenCalled();
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Lebensmittel bearbeiten"]',
        )!
        .click();
      expect(open).toHaveBeenCalledOnce();
      closed.next(saved);
      closed.complete();
      fixture.detectChanges();
      expect(host.querySelector('h2')?.textContent).toBe(
        saved ? 'Saved, fresh' : 'Original',
      );
      if (saved) {
        expect(host.textContent).toContain('Farm');
        expect(fixture.componentInstance.foodstuff().kcal).toBe(123);
      }
    },
  );

  it.each([true, false])(
    'deletes only after confirmation and handles success: %s',
    async (success) => {
      const deletion = success
        ? Promise.resolve()
        : Promise.reject(new Error('failed'));
      const backend = {
        deleteFoodstuff: vi.fn().mockReturnValue(deletion),
        notifyFoodstuffsChanged: vi.fn(),
      };
      const close = vi.fn();
      const open = vi.fn();
      const snackBar = { open: vi.fn() };
      TestBed.configureTestingModule({
        imports: [FoodstuffPresentationDialogComponent],
        providers: [
          {
            provide: MAT_DIALOG_DATA,
            useValue: { foodstuff: foodstuffOut({ id: 42 }), editable: true },
          },
          { provide: MatDialog, useValue: { open } },
          { provide: MatDialogRef, useValue: { close } },
          { provide: FoodstuffBackendService, useValue: backend },
          { provide: SnackBarService, useValue: snackBar },
          { provide: FoodstuffImageService, useValue: { contentUrl: vi.fn() } },
        ],
      });
      const fixture = TestBed.createComponent(
        FoodstuffPresentationDialogComponent,
      );
      vi.spyOn(fixture.componentInstance.dialog, 'open').mockImplementation(
        open,
      );
      fixture.detectChanges();
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Lebensmittel löschen"]',
        )!
        .click();
      expect(backend.deleteFoodstuff).not.toHaveBeenCalled();
      const config = open.mock.calls[0][1] as { data: ConfirmationDialogData };
      const data = config.data;
      if (success) await data.action();
      else await expect(data.action()).rejects.toThrow('failed');
      expect(backend.deleteFoodstuff).toHaveBeenCalledWith(42);
      expect(backend.notifyFoodstuffsChanged).toHaveBeenCalledTimes(
        success ? 1 : 0,
      );
      expect(close).toHaveBeenCalledTimes(success ? 1 : 0);
      expect(snackBar.open).toHaveBeenCalled();
    },
  );

  it('disables delete for foodstuffs used by a recipe', () => {
    const open = vi.fn();
    TestBed.configureTestingModule({
      imports: [FoodstuffPresentationDialogComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            foodstuff: foodstuffOut({ recipeVersionIds: ['version'] }),
            editable: true,
          },
        },
        { provide: MatDialog, useValue: { open } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: FoodstuffBackendService, useValue: {} },
        { provide: SnackBarService, useValue: { open: vi.fn() } },
        { provide: FoodstuffImageService, useValue: { contentUrl: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(
      FoodstuffPresentationDialogComponent,
    );
    fixture.detectChanges();
    const buttons = (
      fixture.nativeElement as HTMLElement
    ).querySelectorAll<HTMLButtonElement>('app-floating-actions button');
    expect(buttons[0].getAttribute('aria-label')).toBe(
      'Lebensmittel bearbeiten',
    );
    expect(buttons[1].disabled).toBe(true);
    buttons[1].click();
    expect(open).not.toHaveBeenCalled();
  });

  it('has no edit action in read-only mode', () => {
    TestBed.configureTestingModule({
      imports: [FoodstuffPresentationDialogComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { foodstuff: foodstuffOut(), editable: false },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: FoodstuffBackendService, useValue: {} },
        { provide: SnackBarService, useValue: { open: vi.fn() } },
        { provide: FoodstuffImageService, useValue: { contentUrl: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(
      FoodstuffPresentationDialogComponent,
    );
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'app-floating-actions',
      ),
    ).toBeNull();
  });
});
