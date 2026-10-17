import type { RecipeVersionOut } from '../../../core/api/generated';
import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { ElementWidthService } from '../../../core/services/element-width.service';
import { RecipesGridControlsService } from '../../services/recipes-grid-controls.service';
import { RecipesGridElementComponent } from '../recipes-grid-element/recipes-grid-element.component';
import { RecipesGridComponent } from './recipes-grid.component';

describe('RecipesGridComponent', () => {
  it('reflows varying card heights without changing link order and releases its observer', async () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    const observer: ResizeObserver = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect,
    };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
          return observer;
        }
      },
    );
    try {
      TestBed.configureTestingModule({
        imports: [RecipesGridComponent, RouterTestingModule],
        providers: [
          {
            provide: ElementWidthService,
            useValue: { observe: () => signal(360) },
          },
        ],
      }).overrideComponent(RecipesGridComponent, {
        remove: { imports: [RecipesGridElementComponent] },
        add: { imports: [RecipeGridElementStubComponent] },
      });
      const fixture = TestBed.createComponent(RecipesGridComponent);
      fixture.componentRef.setInput('recipeVersions', [
        recipeVersion('short', '2026-09-10T11:00:00Z', 'active'),
        recipeVersion('long', '2026-09-10T10:00:00Z', 'draft'),
      ]);
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      const links = Array.from(
        element.querySelectorAll<HTMLAnchorElement>('a.recipe-link'),
      );
      links.forEach((link) => (link.style.marginBottom = '8px'));
      const entries = (heights: number[]): ResizeObserverEntry[] =>
        links.map((target, index) => ({
          target,
          borderBoxSize: [{ inlineSize: 160, blockSize: heights[index] }],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
          contentRect: new DOMRect(),
        }));

      resizeCallback?.(entries([100, 120]), observer);
      fixture.detectChanges();
      expect(links.map((link) => link.style.gridRowEnd)).toEqual([
        'span 108',
        'span 128',
      ]);
      resizeCallback?.(entries([140, 160]), observer);
      fixture.detectChanges();
      expect(links.map((link) => link.style.gridRowEnd)).toEqual([
        'span 148',
        'span 168',
      ]);
      expect(links.map((link) => link.dataset['recipeVersionId'])).toEqual([
        'short',
        'long',
      ]);
      disconnect.mockClear();
      fixture.destroy();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('updates recipe columns from its own element width at the existing breakpoints', () => {
    const width = signal(480);
    const observe = vi.fn().mockReturnValue(width);
    TestBed.configureTestingModule({
      imports: [RecipesGridComponent, RouterTestingModule],
      providers: [{ provide: ElementWidthService, useValue: { observe } }],
    });
    const fixture = TestBed.createComponent(RecipesGridComponent);

    expect(observe.mock.calls[0][0]).toBe(fixture.nativeElement);
    expect(fixture.componentInstance.displayedColumns()).toBe(2);
    width.set(599);
    expect(fixture.componentInstance.displayedColumns()).toBe(2);
    width.set(600);
    expect(fixture.componentInstance.displayedColumns()).toBe(3);
    width.set(899);
    expect(fixture.componentInstance.displayedColumns()).toBe(3);
    width.set(900);
    expect(fixture.componentInstance.displayedColumns()).toBe(4);
    width.set(480);
    expect(fixture.componentInstance.displayedColumns()).toBe(2);
  });

  it('orders active versions and drafts by last modification time without mutating the input', () => {
    const recipeVersions: RecipeVersionOut[] = [
      recipeVersion(
        '00000000-0000-0000-0000-000000000001',
        '2026-09-10T09:00:00Z',
        'active',
      ),
      recipeVersion(
        '00000000-0000-0000-0000-000000000002',
        '2026-09-10T11:00:00Z',
        'draft',
      ),
      recipeVersion(
        '00000000-0000-0000-0000-000000000003',
        '2026-09-10T10:00:00Z',
        'active',
      ),
    ];
    const component = Object.create(
      RecipesGridComponent.prototype,
    ) as RecipesGridComponent;

    const sorted = component.sortRecipeVersions(recipeVersions);

    expect(
      sorted.map((recipeVersion) => recipeVersion.recipeVersionId),
    ).toEqual([
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000001',
    ]);
    expect(
      recipeVersions.map((recipeVersion) => recipeVersion.recipeVersionId),
    ).toEqual([
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
    ]);
  });

  it('creates absolute commands for active and draft links', () => {
    const component = Object.create(
      RecipesGridComponent.prototype,
    ) as RecipesGridComponent;

    expect(
      component.recipeVersionLink(
        recipeVersion('active-version', '2026-09-10T09:00:00Z', 'active'),
      ),
    ).toEqual(['/recipes', '00000000-0000-4000-8000-000000000001']);
    expect(
      component.recipeVersionLink(
        recipeVersion('draft-version', '2026-09-10T09:00:00Z', 'draft'),
      ),
    ).toEqual([
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
        {
          provide: ElementWidthService,
          useValue: { observe: () => signal(360) },
        },
        RecipesGridControlsService,
      ],
    })
      .overrideComponent(RecipesGridComponent, {
        remove: { imports: [RecipesGridElementComponent] },
        add: { imports: [RecipeGridElementStubComponent] },
      })
      .compileComponents();
    const fixture: ComponentFixture<RecipesGridComponent> =
      TestBed.createComponent(RecipesGridComponent);
    fixture.componentRef.setInput('recipeVersions', [
      recipeVersion(
        '00000000-0000-0000-0000-000000000001',
        '2026-09-10T09:00:00Z',
        'active',
      ),
      recipeVersion(
        '00000000-0000-0000-0000-000000000002',
        '2026-09-10T11:00:00Z',
        'draft',
      ),
    ]);
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll(
      'a.recipe-link',
    ) as NodeListOf<HTMLAnchorElement>;

    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe(
      '/recipes/00000000-0000-4000-8000-000000000001/versions/00000000-0000-0000-0000-000000000002',
    );
    expect(links[1].getAttribute('href')).toBe(
      '/recipes/00000000-0000-4000-8000-000000000001',
    );
  });
});

@Component({
  selector: 'app-recipes-grid-element',
  standalone: true,
  template: '',
})
class RecipeGridElementStubComponent {
  readonly recipeVersion = input.required<RecipeVersionOut>();
}

function recipeVersion(
  recipeVersionId: string,
  lastModified: string,
  state: RecipeVersionOut['state'],
): RecipeVersionOut {
  return {
    imageId: null,
    imageDimensions: null,
    recipeLineageId: '00000000-0000-4000-8000-000000000001',
    recipeVersionId,
    state,
    createdAt: lastModified,
    lastModified,
    name: 'Recipe',
    servings: 1,
    preptime: null,
    kcal: { status: 'unknown' as const, value: null },
    carbs: { status: 'unknown' as const, value: null },
    protein: { status: 'unknown' as const, value: null },
    fat: { status: 'unknown' as const, value: null },
    ingredients: [],
    steps: [],
  };
}
