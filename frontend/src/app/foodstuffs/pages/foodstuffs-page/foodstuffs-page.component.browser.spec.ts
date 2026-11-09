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
    const viewport = host.querySelector<HTMLElement>('app-foodstuffs-list')!;
    const rows = host.querySelectorAll<HTMLButtonElement>(
      'button[mat-list-item]',
    );
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
    const controls = host.querySelector<HTMLElement>('.bottom-elements')!;
    expect(viewport.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      controls.getBoundingClientRect().top,
    );
    expect(rows[29].getBoundingClientRect().bottom).toBeLessThanOrEqual(
      viewport.getBoundingClientRect().bottom,
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
