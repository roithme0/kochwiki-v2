import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { PageHeaderService } from '../../../core/services/page-header.service';
import { SnackBarService } from '../../../core/services/snack-bar.service';
import { recipeVersionOut } from '../../../testing/recipe.fixtures';
import { RecipeBackendService } from '../../services/recipe-backend.service';
import { RecipesPageComponent } from './recipes-page.component';

it('keeps the final cards above the fade and centers the error message', async () => {
  const recipes = Array.from({ length: 20 }, (_, index) =>
    recipeVersionOut({
      recipeVersionId: `version-${index}`,
      recipeLineageId: `lineage-${index}`,
      name: `Recipe ${index}`,
    }),
  );
  const recipesChanged$ = new Subject<void>();
  const getAllRecipeVersions = vi.fn().mockResolvedValue(recipes);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: RecipeBackendService,
        useValue: { getAllRecipeVersions, recipesChanged$ },
      },
      { provide: PageHeaderService, useValue: { updateHeader: vi.fn() } },
      { provide: SnackBarService, useValue: { open: vi.fn() } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(RecipesPageComponent);
  const host = fixture.nativeElement as HTMLElement;
  host.style.width = '320px';
  host.style.height = '600px';
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const viewport = host.querySelector<HTMLElement>('.grid-wrapper')!;
  await expect
    .poll(() => {
      fixture.detectChanges();
      return viewport.scrollHeight;
    })
    .toBeGreaterThan(viewport.clientHeight);
  await expect
    .poll(() => {
      fixture.detectChanges();
      viewport.scrollTop = viewport.scrollHeight;
      const cards = Array.from(
        host.querySelectorAll<HTMLElement>('.recipe-link'),
      );
      const lowestCard = Math.max(
        ...cards.map((card) => card.getBoundingClientRect().bottom),
      );
      return viewport.getBoundingClientRect().bottom - lowestCard;
    })
    .toBeGreaterThanOrEqual(32);

  getAllRecipeVersions.mockRejectedValueOnce(new Error('failed'));
  recipesChanged$.next();
  await fixture.whenStable();
  fixture.detectChanges();
  const main = host.querySelector<HTMLElement>('main')!.getBoundingClientRect();
  const error = host
    .querySelector<HTMLElement>('.error-wrapper p')!
    .getBoundingClientRect();
  expect(error.left + error.width / 2).toBeCloseTo(
    main.left + main.width / 2,
    0,
  );
  expect(error.top + error.height / 2).toBeCloseTo(
    main.top + main.height / 2,
    0,
  );
  fixture.destroy();
});
