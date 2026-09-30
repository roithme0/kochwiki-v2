import type { RecipeVersionOut } from '../../../core/api/generated';
import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';

import { RecipesGridElementComponent } from './recipes-grid-element.component';

@Component({ selector: 'app-macro-chart', template: '' })
class MacroChartStubComponent {
  readonly nutrition = input.required<unknown>();
  readonly showKcal = input(true);
}

describe('RecipesGridElementComponent', () => {
  let fixture: ComponentFixture<RecipesGridElementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecipesGridElementComponent],
    })
      .overrideComponent(RecipesGridElementComponent, {
        remove: { imports: [MacroChartComponent] },
        add: { imports: [MacroChartStubComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(RecipesGridElementComponent);
    fixture.componentRef.setInput('recipeVersion', draftRecipeVersion);
    fixture.detectChanges();
  });

  it('overlays the draft badge on the chart without last-modified text', () => {
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
});

const draftRecipeVersion: RecipeVersionOut = {
  recipeLineageId: '00000000-0000-4000-8000-000000000001',
  recipeVersionId: '00000000-0000-4000-8000-000000000002',
  state: 'draft',
  createdAt: '2026-09-10T10:00:00Z',
  lastModified: '2026-09-10T11:00:00Z',
  name: 'Recipe',
  servings: 2,
  preptime: null,
  originName: null,
  originUrl: null,
  kcal: null,
  carbs: null,
  protein: null,
  fat: null,
  ingredients: [],
  steps: [],
};
