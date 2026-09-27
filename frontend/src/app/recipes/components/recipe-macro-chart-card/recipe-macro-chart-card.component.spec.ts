import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import { RecipePresentation } from '../../models/recipe-presentation';
import { RecipeMacroChartCardComponent } from './recipe-macro-chart-card.component';

describe('RecipeMacroChartCardComponent legend lifecycle', () => {
  let fixture: ComponentFixture<RecipeMacroChartCardComponent>;
  const recipe: RecipePresentation = {
    servings: 1, preptime: null, kcal: 330, carbs: 40, protein: 20, fat: 10,
    ingredients: [], steps: [],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RecipeMacroChartCardComponent] });
    TestBed.overrideComponent(MacroChartComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(RecipeMacroChartCardComponent);
  });

  function render(value: RecipePresentation): void {
    fixture.componentRef.setInput('recipe', value);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  function legendText(): string {
    return (fixture.nativeElement as HTMLElement).querySelector('.legend')?.textContent ?? '';
  }

  it('renders complete nutrition with real legend colors', () => {
    expect(() => render(recipe)).not.toThrow();
    expect(legendText()).toContain('Kohlenhydrate');
    expect(legendText()).toContain('Protein');
    expect(legendText()).toContain('Fett');
    const colors = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.color-indicator'))
      .map(element => element.style.getPropertyValue('--color'));
    expect(colors).toEqual(['rgb(19,154,155)', 'rgb(155, 255, 117)', 'rgb(255,97,97)']);
  });

  it('does not render nutrient entries for the zero-nutrition placeholder chart', () => {
    expect(() => render({ ...recipe, kcal: 0, carbs: 0, protein: 0, fat: 0 })).not.toThrow();
    expect(legendText()).toBe('');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-macro-chart')).not.toBeNull();
  });

  it('updates safely between complete, zero, missing, and restored nutrition', () => {
    render(recipe);
    expect(() => render({ ...recipe, carbs: 0, protein: 0, fat: 0 })).not.toThrow();
    expect(legendText()).toBe('');
    render({ ...recipe, protein: null });
    expect(legendText()).toBe('');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('unvollständig');
    render(recipe);
    expect(legendText()).toContain('Protein');
  });
});
