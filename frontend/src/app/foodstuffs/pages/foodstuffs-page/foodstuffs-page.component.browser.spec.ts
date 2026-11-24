import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { page, userEvent } from 'vitest/browser';
import { foodstuffOut } from '../../../testing/foodstuff.fixtures';
import { FoodstuffBackendService } from '../../services/foodstuff-backend.service';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { RecipeBackendService } from '../../../recipes/services/recipe-backend.service';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { FoodstuffPatchDialogComponent } from '../../dialogs/foodstuff-patch-dialog/foodstuff-patch-dialog.component';
import { FoodstuffsPageComponent } from './foodstuffs-page.component';

it('centers the empty search and error states in their available areas', async () => {
  const getAllFoodstuffs = vi.fn().mockResolvedValue([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FoodstuffBackendService,
        useValue: { getAllFoodstuffs, foodstuffsChanged$: new Subject<void>() },
      },
      {
        provide: RecipeBackendService,
        useValue: { recipesChanged$: new Subject<void>() },
      },
      { provide: FoodstuffImageService, useValue: {} },
      { provide: PageHeaderService, useValue: { updateHeader: vi.fn() } },
      { provide: SnackBarService, useValue: { open: vi.fn() } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(FoodstuffsPageComponent);
  const host = fixture.nativeElement as HTMLElement;
  host.style.height = '600px';
  host.style.width = '320px';
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.componentInstance.foodstuffSearchState.searchBy = 'missing';
  fixture.detectChanges();

  const assertCentered = (outer: HTMLElement, inner: HTMLElement): void => {
    const container = outer.getBoundingClientRect();
    const content = inner.getBoundingClientRect();
    expect(content.left + content.width / 2).toBeCloseTo(
      container.left + container.width / 2,
      0,
    );
    expect(content.top + content.height / 2).toBeCloseTo(
      container.top + container.height / 2,
      0,
    );
  };
  const viewport = host.querySelector<HTMLElement>('app-foodstuffs-list')!;
  const message = host.querySelector<HTMLElement>('.empty-state p')!;
  const reset = host.querySelector<HTMLElement>('.empty-state button')!;
  const viewportRect = viewport.getBoundingClientRect();
  const messageRect = message.getBoundingClientRect();
  const resetRect = reset.getBoundingClientRect();
  expect(messageRect.left + messageRect.width / 2).toBeCloseTo(
    viewportRect.left + viewportRect.width / 2,
    0,
  );
  expect((messageRect.top + resetRect.bottom) / 2).toBeCloseTo(
    viewportRect.top + viewportRect.height / 2,
    0,
  );

  getAllFoodstuffs.mockRejectedValueOnce(new Error('failed'));
  await fixture.componentInstance.catalogue.refresh();
  fixture.detectChanges();
  assertCentered(
    host.querySelector('main')!,
    host.querySelector('app-error-hint')!,
  );
  const hint = host.querySelector('app-error-hint')!;
  expect(hint.querySelector('mat-icon')?.getAttribute('fontIcon')).toBe(
    'error',
  );
  expect(hint.querySelector('p')?.textContent?.trim()).toBe(
    'Zutaten konnten nicht geladen werden.',
  );
  fixture.destroy();
});

it.each([320, 640])(
  'keeps the final row above floating controls, resets scrolling on search and supports native keyboard activation at %i px',
  async (width) => {
    await page.viewport(width, 800);
    const open = vi.fn();
    const records = Array.from({ length: 30 }, (_, id) =>
      foodstuffOut({ id, name: `Item ${String(id).padStart(2, '0')}` }),
    );
    let resolveRefresh!: (value: typeof records) => void;
    const getAllFoodstuffs = vi.fn().mockResolvedValue(records);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FoodstuffBackendService,
          useValue: {
            getAllFoodstuffs,
            foodstuffsChanged$: new Subject<void>(),
          },
        },
        {
          provide: RecipeBackendService,
          useValue: { recipesChanged$: new Subject<void>() },
        },
        { provide: FoodstuffImageService, useValue: {} },
        { provide: PageHeaderService, useValue: { updateHeader: vi.fn() } },
        { provide: SnackBarService, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open } },
      ],
    });
    const fixture = TestBed.createComponent(FoodstuffsPageComponent);
    const host = fixture.nativeElement as HTMLElement;
    host.style.height = '600px';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    let viewport = host.querySelector<HTMLElement>('app-foodstuffs-list')!;
    expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    viewport.scrollTop = viewport.scrollHeight;
    expect(viewport.scrollTop).toBeGreaterThan(0);
    getAllFoodstuffs.mockReturnValueOnce(
      new Promise<typeof records>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const refresh = fixture.componentInstance.catalogue.refresh();
    fixture.detectChanges();
    expect(host.querySelector('app-foodstuffs-list')).toBeNull();
    expect(host.querySelector('mat-spinner')).not.toBeNull();
    resolveRefresh(records);
    await refresh;
    fixture.detectChanges();
    await fixture.whenStable();
    viewport = host.querySelector<HTMLElement>('app-foodstuffs-list')!;
    expect(viewport.scrollTop).toBe(0);
    const rows = host.querySelectorAll<HTMLButtonElement>(
      'button[mat-list-item]',
    );
    viewport.scrollTop = viewport.scrollHeight;
    const controls = host.querySelector<HTMLElement>('.bottom-elements')!;
    expect(viewport.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      controls.getBoundingClientRect().top,
    );
    expect(rows[29].getBoundingClientRect().bottom).toBeLessThanOrEqual(
      viewport.getBoundingClientRect().bottom - 32,
    );
    expect(host.querySelector('.bottom-elements-placeholder')).toBeNull();
    expect(getComputedStyle(viewport).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    rows[29].focus();
    await userEvent.keyboard('{Tab}');
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(rows[29]);
    expect(rows[29].matches(':focus-visible')).toBe(true);
    await userEvent.keyboard('{Enter}');
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenLastCalledWith(
      FoodstuffPatchDialogComponent,
      expect.objectContaining({ data: { id: 29 } }),
    );
    await userEvent.keyboard(' ');
    expect(open).toHaveBeenCalledTimes(2);
    fixture.componentInstance.foodstuffSearchState.searchBy = 'Item';
    fixture.detectChanges();
    await fixture.whenStable();
    expect(viewport.scrollTop).toBe(0);
    fixture.destroy();
  },
);
