import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { foodstuffOut } from '../../../testing/foodstuff.fixtures';
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

  it('has no edit action in read-only mode', () => {
    TestBed.configureTestingModule({
      imports: [FoodstuffPresentationDialogComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { foodstuff: foodstuffOut(), editable: false },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
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
