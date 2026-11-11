import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { page, userEvent } from 'vitest/browser';
import { foodstuffOut } from '../../../testing/foodstuff.fixtures';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { FoodstuffSelectionDialogComponent } from './foodstuff-selection-dialog.component';

describe('Foodstuff picker result layout', () => {
  it.each([280, 640])(
    'truncates names, details and brands beside selection status at %i px',
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
      const image = result?.querySelector<HTMLElement>('app-display-image');
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
      expect(
        details.parentElement!.getBoundingClientRect().right,
      ).toBeLessThanOrEqual(status.getBoundingClientRect().left);
      expect(getComputedStyle(details).color).not.toBe(
        getComputedStyle(name).color,
      );
      const display = result.querySelector<HTMLElement>(
        'app-foodstuff-display',
      )!;
      expect(getComputedStyle(display).paddingTop).toBe('8px');
      expect(getComputedStyle(display).paddingBottom).toBe('8px');
      expect(image.getBoundingClientRect().width).toBe(40);
      expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
      result.click();
      fixture.detectChanges();
      expect(result.getAttribute('aria-pressed')).toBe('false');
      fixture.destroy();
    },
  );
});

it('keeps disabled rows inactive and resets the actual scrolling results only when search changes', async () => {
  await page.viewport(640, 800);
  const records = Array.from({ length: 30 }, (_, id) =>
    foodstuffOut({ id, name: `Item ${String(id).padStart(2, '0')}` }),
  );
  let resolveRefresh!: (value: typeof records) => void;
  const getAllFoodstuffs = vi.fn().mockResolvedValue(records);
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: { existingFoodstuffIds: [0] } },
      { provide: MatDialogRef, useValue: { close: vi.fn() } },
      { provide: FoodstuffImageService, useValue: {} },
      {
        provide: FoodstuffBackendService,
        useValue: { getAllFoodstuffs, foodstuffsChanged$: new Subject<void>() },
      },
    ],
  });
  const fixture = TestBed.createComponent(FoodstuffSelectionDialogComponent);
  const host = fixture.nativeElement as HTMLElement;
  host.style.height = '600px';
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const viewport = host.querySelector<HTMLElement>('app-foodstuffs-list')!;
  const rows = host.querySelectorAll<HTMLButtonElement>(
    'button[mat-list-item]',
  );
  expect(rows[0].disabled).toBe(true);
  rows[0].click();
  rows[0].focus();
  await userEvent.keyboard('{Enter}');
  await userEvent.keyboard(' ');
  expect(fixture.componentInstance.selectedFoodstuffIds().size).toBe(0);
  expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
  viewport.scrollTop = viewport.scrollHeight;
  const beforeRefresh = viewport.scrollTop;
  const beforeRect = viewport.getBoundingClientRect();
  getAllFoodstuffs.mockReturnValueOnce(
    new Promise<typeof records>((resolve) => {
      resolveRefresh = resolve;
    }),
  );
  const refresh = fixture.componentInstance.catalogue.refresh();
  fixture.detectChanges();
  expect(viewport.scrollTop).toBe(beforeRefresh);
  const duringRect = viewport.getBoundingClientRect();
  expect(duringRect.top).toBeCloseTo(beforeRect.top, 0);
  expect(duringRect.height).toBeCloseTo(beforeRect.height, 0);
  expect(duringRect.width).toBeCloseTo(beforeRect.width, 0);
  resolveRefresh(records);
  await refresh;
  fixture.detectChanges();
  await fixture.whenStable();
  expect(viewport.scrollTop).toBe(beforeRefresh);
  viewport.scrollTop = viewport.scrollHeight;
  const previous = viewport.scrollTop;
  rows[29].click();
  rows[28].click();
  fixture.detectChanges();
  await fixture.whenStable();
  expect(viewport.scrollTop).toBe(previous);
  expect(host.querySelectorAll('.basket-preview li')).toHaveLength(2);
  expect(
    host.querySelector<HTMLButtonElement>('.basket-summary button')?.disabled,
  ).toBe(false);
  expect(
    host.querySelector<HTMLButtonElement>('.create-foodstuff-button')?.disabled,
  ).toBe(false);
  fixture.componentInstance.searchValue.set('Item');
  fixture.detectChanges();
  await fixture.whenStable();
  expect(viewport.scrollTop).toBe(0);
  fixture.destroy();
});
