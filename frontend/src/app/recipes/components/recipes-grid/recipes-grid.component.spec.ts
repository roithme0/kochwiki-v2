import type { RecipeVersionOut } from '../../../core/api/generated';
import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { WindowWidthService } from '../../../core/services/window-width.service';
import { RecipesGridControlsService } from '../../services/recipes-grid-controls.service';
import { RecipesGridElementComponent } from '../recipes-grid-element/recipes-grid-element.component';
import { RecipesGridComponent } from './recipes-grid.component';

describe('RecipesGridComponent', () => {
  it('orders active versions and drafts by last modification time without mutating the input', () => {
    const recipeVersions: RecipeVersionOut[] = [
      recipeVersion('00000000-0000-0000-0000-000000000001', '2026-09-10T09:00:00Z', 'active'),
      recipeVersion('00000000-0000-0000-0000-000000000002', '2026-09-10T11:00:00Z', 'draft'),
      recipeVersion('00000000-0000-0000-0000-000000000003', '2026-09-10T10:00:00Z', 'active'),
    ];
    const component = Object.create(RecipesGridComponent.prototype) as RecipesGridComponent;

    const sorted = component.sortRecipeVersions(recipeVersions);

    expect(sorted.map((recipeVersion) => recipeVersion.recipeVersionId)).toEqual([
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000001',
    ]);
    expect(recipeVersions.map((recipeVersion) => recipeVersion.recipeVersionId)).toEqual([
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
    ]);
  });

  it('creates absolute commands for active and draft links', () => {
    const component = Object.create(RecipesGridComponent.prototype) as RecipesGridComponent;

    expect(component.recipeVersionLink(recipeVersion('active-version', '2026-09-10T09:00:00Z', 'active'))).toEqual([
      '/recipes',
      '00000000-0000-4000-8000-000000000001',
    ]);
    expect(component.recipeVersionLink(recipeVersion('draft-version', '2026-09-10T09:00:00Z', 'draft'))).toEqual([
      '/recipes',
      '00000000-0000-4000-8000-000000000001',
      'versions',
      'draft-version',
    ]);
  });

  it('renders active and draft entries as absolute links to their exact versions', async () => {
    await TestBed.configureTestingModule({
      imports: [RecipesGridComponent, RouterTestingModule],
      providers: [
        { provide: WindowWidthService, useValue: { getWindowInnerWidth: () => signal(360) } },
        RecipesGridControlsService,
      ],
    })
      .overrideComponent(RecipesGridComponent, {
        remove: { imports: [RecipesGridElementComponent] },
        add: { imports: [RecipeGridElementStubComponent] },
      })
      .compileComponents();
    const fixture: ComponentFixture<RecipesGridComponent> = TestBed.createComponent(RecipesGridComponent);
    fixture.componentRef.setInput('recipeVersions', [
      recipeVersion('00000000-0000-0000-0000-000000000001', '2026-09-10T09:00:00Z', 'active'),
      recipeVersion('00000000-0000-0000-0000-000000000002', '2026-09-10T11:00:00Z', 'draft'),
    ]);
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('a.recipe-link') as NodeListOf<HTMLAnchorElement>;

    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('/recipes/00000000-0000-4000-8000-000000000001/versions/00000000-0000-0000-0000-000000000002');
    expect(links[1].getAttribute('href')).toBe('/recipes/00000000-0000-4000-8000-000000000001');
  });
});

@Component({ selector: 'app-recipes-grid-element', standalone: true, template: '' })
class RecipeGridElementStubComponent {
  readonly recipeVersion = input.required<RecipeVersionOut>();
}

function recipeVersion(recipeVersionId: string, lastModified: string, state: RecipeVersionOut['state']): RecipeVersionOut {
  return {
    recipeLineageId: '00000000-0000-4000-8000-000000000001',
    recipeVersionId,
    state,
    createdAt: lastModified,
    lastModified,
    name: 'Recipe',
    servings: 1,
    preptime: null,
    kcal: null,
    carbs: null,
    protein: null,
    fat: null,
    ingredients: [],
    steps: [],
  };
}
