import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { EMPTY } from 'rxjs';
import { page, userEvent } from 'vitest/browser';
import { ActiveUserService } from '../../../core/services/active-user.service';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { foodstuffSummary } from '../../../testing/foodstuff.fixtures';
import { recipeVersionOut } from '../../../testing/recipe.fixtures';
import { FoodstuffImageService } from '../../../foodstuffs/services/foodstuff-image.service';
import { FoodstuffPresentationDialogComponent } from '../../../foodstuffs/dialogs/foodstuff-presentation-dialog/foodstuff-presentation-dialog.component';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipeImageService } from '../../services/recipe-image.service';
import { RecipePageComponent } from './recipe-page.component';

it('keeps recipe actions visible at narrow width and opens ingredients by keyboard', async () => {
  await page.viewport(320, 600);
  const ingredient = foodstuffSummary({ name: 'Oats', unit: 'G' });
  const recipe = recipeVersionOut({
    state: 'draft',
    ownerId: 1,
    ingredients: [
      {
        id: 1,
        index: 2,
        amount: 50,
        recipeVersionId: '00000000-0000-4000-8000-000000000001',
        foodstuff: ingredient,
      },
    ],
    steps: [
      {
        id: 1,
        index: 0,
        description: 'Last instruction',
        recipeVersionId: '00000000-0000-4000-8000-000000000001',
      },
    ],
  });
  const open = vi.fn();
  TestBed.configureTestingModule({
    imports: [RecipePageComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActiveUserService,
        useValue: { activeUser: signal({ id: 1 }) },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ lineageId: recipe.recipeLineageId }),
          },
        },
      },
      {
        provide: RecipeBackendService,
        useValue: {
          recipesChanged$: EMPTY,
          getActiveRecipeVersion: vi.fn().mockResolvedValue(recipe),
        },
      },
      { provide: RecipeImageService, useValue: { contentUrl: vi.fn() } },
      { provide: FoodstuffImageService, useValue: { contentUrl: vi.fn() } },
      {
        provide: PageHeaderService,
        useValue: { updateHeader: vi.fn(), headline: '' },
      },
      { provide: SnackBarService, useValue: { open: vi.fn() } },
      { provide: MatDialog, useValue: { open } },
    ],
  });
  const fixture = TestBed.createComponent(RecipePageComponent);
  const host = fixture.nativeElement as HTMLElement;
  host.style.width = '320px';
  host.style.height = '400px';
  document.body.appendChild(host);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const row = Array.from(
    host.querySelectorAll<HTMLButtonElement>('button'),
  ).find((item) => item.textContent?.includes('Oats'))!;
  row.focus();
  await userEvent.keyboard('{Enter}');
  expect(open).toHaveBeenCalledWith(
    FoodstuffPresentationDialogComponent,
    expect.objectContaining({
      data: { foodstuff: ingredient, editable: false },
    }),
  );
  const scroll = host.querySelector<HTMLElement>('article')!;
  const actions = host.querySelector<HTMLElement>('app-floating-actions')!;
  const before = actions.getBoundingClientRect();
  scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'instant' });
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const after = actions.getBoundingClientRect();
  expect(after.bottom).toBeCloseTo(before.bottom, 0);
  const content = host.querySelector<HTMLElement>('app-recipe-presentation')!;
  expect(content.getBoundingClientRect().bottom).toBeLessThanOrEqual(after.top);
  fixture.destroy();
});
