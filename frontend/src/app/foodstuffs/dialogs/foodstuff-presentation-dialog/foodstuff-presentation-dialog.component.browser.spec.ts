import { TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { page } from 'vitest/browser';
import { Subject } from 'rxjs';
import { foodstuffOut } from '../../../testing/foodstuff.fixtures';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { FoodstuffPresentationDialogComponent } from './foodstuff-presentation-dialog.component';

it('keeps the edit action visible while the last content clears it at narrow width', async () => {
  await page.viewport(320, 600);
  TestBed.configureTestingModule({
    imports: [FoodstuffPresentationDialogComponent],
    providers: [
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          foodstuff: foodstuffOut({
            name: 'Long'.repeat(4),
            brand: 'Brand'.repeat(4),
          }),
          editable: true,
        },
      },
      { provide: MatDialog, useValue: { open: vi.fn() } },
      { provide: MatDialogRef, useValue: { close: vi.fn() } },
      { provide: FoodstuffBackendService, useValue: {} },
      { provide: SnackBarService, useValue: { open: vi.fn() } },
      { provide: FoodstuffImageService, useValue: { contentUrl: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(FoodstuffPresentationDialogComponent);
  const host = fixture.nativeElement as HTMLElement;
  host.style.width = '320px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const closed = new Subject<void>();
  vi.spyOn(fixture.componentInstance.dialog, 'open').mockReturnValue({
    afterClosed: () => closed,
  } as never);
  fixture.detectChanges();
  await fixture.whenStable();
  const scroll = host.querySelector<HTMLElement>('mat-dialog-content')!;
  const actions = host.querySelector<HTMLElement>('app-floating-actions')!;
  scroll.style.overflowY = 'auto';
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
  const before = actions.getBoundingClientRect();
  scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'instant' });
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const after = actions.getBoundingClientRect();
  expect(after.bottom).toBeCloseTo(before.bottom, 0);
  expect(after.right).toBeCloseTo(before.right, 0);
  const content = host.querySelector<HTMLElement>(
    'app-foodstuff-presentation',
  )!;
  expect(content.getBoundingClientRect().bottom).toBeLessThanOrEqual(after.top);
  const close = host.querySelector<HTMLButtonElement>(
    'app-dialog-header button',
  )!;
  const edit = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Lebensmittel bearbeiten"]',
  )!;
  expect(close.getBoundingClientRect().right).toBeLessThanOrEqual(
    host.getBoundingClientRect().right,
  );
  close.focus();
  edit.click();
  expect(document.activeElement).toBe(close);
  closed.next();
  expect(document.activeElement).toBe(close);
  fixture.destroy();
});
