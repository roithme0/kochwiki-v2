import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { page } from 'vitest/browser';
import { foodstuffOut } from '../../../testing/foodstuff.fixtures';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { FoodstuffSelectionDialogComponent } from './foodstuff-selection-dialog.component';

describe('Foodstuff picker result layout', () => {
  it.each([280, 640])(
    'wraps names, details and brands beside selection status at %i px',
    async (width) => {
      await page.viewport(800, 1000);
      const foodstuff = foodstuffOut({
        id: 1,
        name: 'Pfefferonen mit einem besonders langen Produktnamen',
        details:
          'grün, scharf und mit sehr langen beschreibenden Angaben für den Zeilenumbruch',
        brand: 'Eine besonders lange Lebensmittelmarke',
        imageId: null,
      });
      TestBed.configureTestingModule({
        imports: [FoodstuffSelectionDialogComponent],
        providers: [
          { provide: MAT_DIALOG_DATA, useValue: { existingFoodstuffIds: [] } },
          { provide: MatDialogRef, useValue: { close: vi.fn() } },
          { provide: FoodstuffImageService, useValue: {} },
          {
            provide: FoodstuffBackendService,
            useValue: {
              getAllFoodstuffs: vi.fn().mockResolvedValue([foodstuff]),
              foodstuffsChanged$: new Subject<void>(),
            },
          },
        ],
      });
      const fixture = TestBed.createComponent(
        FoodstuffSelectionDialogComponent,
      );
      const host = fixture.nativeElement as HTMLElement;
      host.style.width = `${width}px`;
      host.style.height = '900px';
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.componentInstance.toggleFoodstuff(1);
      fixture.detectChanges();
      await fixture.whenStable();
      const result = host.querySelector<HTMLButtonElement>(
        'button[mat-list-item]',
      );
      const name = result?.querySelector<HTMLElement>('.foodstuff-name');
      const details = result?.querySelector<HTMLElement>('.foodstuff-details');
      const brand = result?.querySelector<HTMLElement>('.foodstuff-brand');
      const status = result?.querySelector<HTMLElement>('.selection-status');
      const image = result?.querySelector<HTMLElement>('app-foodstuff-image');
      if (!result || !name || !details || !brand || !status || !image)
        throw new Error('Expected complete selected foodstuff result');
      expect(result.getAttribute('aria-pressed')).toBe('true');
      expect(details.parentElement).toBe(name.parentElement);
      expect(brand.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        details.getBoundingClientRect().bottom,
      );
      expect(brand.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        result.getBoundingClientRect().bottom,
      );
      expect(details.getBoundingClientRect().right).toBeLessThanOrEqual(
        status.getBoundingClientRect().left,
      );
      expect(getComputedStyle(details).color).not.toBe(
        getComputedStyle(name).color,
      );
      expect(image.getBoundingClientRect().width).toBe(40);
      expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
      result.click();
      fixture.detectChanges();
      expect(result.getAttribute('aria-pressed')).toBe('false');
      fixture.destroy();
    },
  );
});
