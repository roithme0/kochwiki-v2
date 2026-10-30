import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { RecipeVersionOut } from '../../../core/api/generated';
import { RecipesGridComponent } from './recipes-grid.component';

describe('RecipesGridComponent browser layout', () => {
  it('reflows real grid columns when its host crosses the width breakpoints', async () => {
    TestBed.configureTestingModule({
      imports: [RecipesGridComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(RecipesGridComponent);
    const host = fixture.nativeElement as HTMLElement;
    const recipe: RecipeVersionOut = {
      recipeVersionId: 'version',
      recipeLineageId: 'lineage',
      ownerId: 1,
      state: 'active',
      createdAt: '2026-10-01T10:00:00Z',
      lastModified: '2026-10-01T10:00:00Z',
      name: 'Recipe',
      servings: 1,
      imageId: null,
      imageDimensions: null,
      preptime: null,
      kcal: { status: 'unknown', value: null },
      carbs: { status: 'unknown', value: null },
      protein: { status: 'unknown', value: null },
      fat: { status: 'unknown', value: null },
      ingredients: [],
      steps: [],
    };
    fixture.componentRef.setInput('recipeVersions', [recipe]);
    try {
      fixture.detectChanges();
      const grid = host.querySelector<HTMLElement>('.grid');
      expect(grid).not.toBeNull();
      if (!grid) throw new Error('Recipe grid was not rendered.');

      for (const [width, columns] of [
        [599, 2],
        [600, 3],
        [899, 3],
        [900, 4],
        [480, 2],
      ]) {
        host.style.width = `${width}px`;
        await expect
          .poll(() => {
            fixture.detectChanges();
            return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
          })
          .toBe(columns);
        expect(host.getBoundingClientRect().width).toBe(width);
      }
    } finally {
      fixture.destroy();
    }
  });
});
