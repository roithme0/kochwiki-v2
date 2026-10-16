import type { RecipeImageDownloadOut, RecipeVersionOut } from '../../../core/api/generated';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RecipeImageComponent } from '../recipe-image/recipe-image.component';
import { RecipeImageService } from '../../services/recipe-image.service';

import { RecipesGridElementComponent } from './recipes-grid-element.component';

describe('RecipesGridElementComponent', () => {
  let fixture: ComponentFixture<RecipesGridElementComponent>;
  const download = vi.fn<(imageId: string) => Promise<RecipeImageDownloadOut>>()
    .mockResolvedValue({ url: '/storage/image', expiresIn: 300 });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecipesGridElementComponent],
      providers: [{ provide: RecipeImageService, useValue: { download } }],
    })
      .compileComponents();

    fixture = TestBed.createComponent(RecipesGridElementComponent);
    fixture.componentRef.setInput('recipeVersion', draftRecipeVersion);
    fixture.detectChanges();
  });

  it('overlays the draft badge on the image without last-modified text', () => {
    const chartContent = fixture.nativeElement.querySelector(
      'mat-card-content'
    ) as HTMLElement;
    const badge = chartContent.querySelector(
      'app-recipe-version-state-badge'
    ) as HTMLElement;

    expect(badge.textContent).toContain('Entwurf');
    expect(getComputedStyle(badge).position).toBe('absolute');
    expect(fixture.nativeElement.textContent).not.toContain('Zuletzt geändert');
  });

  it('uses the placeholder and preserves the name and preparation time', () => {
    fixture.componentRef.setInput('recipeVersion', { ...draftRecipeVersion, preptime: 15 });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('img')!.getAttribute('src'))
      .toBe('assets/images/recipe-image-placeholder.png');
    expect(element.querySelector('app-macro-chart')).toBeNull();
    expect(element.querySelector('mat-card-title')!.textContent).toContain('Recipe');
    expect(element.querySelector('mat-card-subtitle')!.textContent).toContain('15 min');
  });

  it('displays the selected version image with natural height', async () => {
    fixture.componentRef.setInput('recipeVersion', {
      ...draftRecipeVersion, imageId: 'draft-image', imageDimensions: { width: 1254, height: 818 },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const image = fixture.debugElement.query(By.directive(RecipeImageComponent))
      .componentInstance as RecipeImageComponent;
    expect(image.imageId()).toBe('draft-image');
    expect(image.naturalHeight()).toBe(true);
    expect(image.imageDimensions()).toEqual({ width: 1254, height: 818 });
    expect((fixture.nativeElement as HTMLElement).querySelector('img')!.getAttribute('src'))
      .toBe('/storage/image');
  });
});

const draftRecipeVersion: RecipeVersionOut = {
  imageId: null, imageDimensions: null,
  recipeLineageId: '00000000-0000-4000-8000-000000000001',
  recipeVersionId: '00000000-0000-4000-8000-000000000002',
  state: 'draft',
  createdAt: '2026-09-10T10:00:00Z',
  lastModified: '2026-09-10T11:00:00Z',
  name: 'Recipe',
  servings: 2,
  preptime: null,
  kcal: { status: 'unknown' as const, value: null },
  carbs: { status: 'unknown' as const, value: null },
  protein: { status: 'unknown' as const, value: null },
  fat: { status: 'unknown' as const, value: null },
  ingredients: [],
  steps: [],
};
