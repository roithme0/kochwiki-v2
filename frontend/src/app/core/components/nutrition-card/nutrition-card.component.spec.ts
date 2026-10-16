import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NutritionSummary, toNutritionSummary } from '../../models/nutrition-result';
import { By } from '@angular/platform-browser';
import { MacroChartComponent } from '../macro-chart/macro-chart.component';
import { NutritionCardComponent } from './nutrition-card.component';

describe('NutritionCardComponent', () => {
  let fixture: ComponentFixture<NutritionCardComponent>;
  const nutrition = toNutritionSummary({ kcal: 330, carbs: 40, protein: 20, fat: 10 });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NutritionCardComponent] });
    TestBed.overrideComponent(MacroChartComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(NutritionCardComponent);
    fixture.componentRef.setInput('basis', 'pro Portion');
  });

  function render(value: NutritionSummary): HTMLElement {
    fixture.componentRef.setInput('nutrition', value);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function renderedChart(): MacroChartComponent {
    return fixture.debugElement.query(By.directive(MacroChartComponent)).componentInstance as MacroChartComponent;
  }

  it('shows saved-recipe lower bounds and unknowns without misleading percentages', () => {
    const element = render({
      kcal: { status: 'minimum', value: 120.9 },
      carbs: { status: 'exact', value: 15 },
      protein: { status: 'minimum', value: 3.29 },
      fat: { status: 'unknown', value: null },
    });
    const chart = fixture.debugElement.query(By.directive(MacroChartComponent))
      .componentInstance as MacroChartComponent;
    expect(chart.dataIncompleteOrInvalid()).toBe(true);
    expect(chart.displayedKcal()).toBe('≥ 120 kcal');
    expect(Array.from(element.querySelectorAll('.value-absolute')).map(el => el.textContent?.trim()))
      .toEqual(['15\u00a0g', '≥ 3.2\u00a0g', '—']);
    expect(element.querySelector('.value-percentage')).toBeNull();

    render({
      kcal: { status: 'unknown', value: null },
      carbs: { status: 'exact', value: 15 },
      protein: { status: 'exact', value: 3 },
      fat: { status: 'exact', value: 2 },
    });
    expect(chart.dataIncompleteOrInvalid()).toBe(false);
    expect(chart.displayedKcal()).toBe('— kcal');
    expect(element.querySelectorAll('.value-percentage').length).toBe(3);
  });

  it('keeps a gray ring for unknown or all-zero recipe macros and distinguishes minimum zero', () => {
    const element = render({
      kcal: { status: 'unknown', value: null },
      carbs: { status: 'unknown', value: null },
      protein: { status: 'minimum', value: 0 },
      fat: { status: 'exact', value: 0 },
    });
    expect(Array.from(element.querySelectorAll('.value-absolute')).map(el => el.textContent?.trim()))
      .toEqual(['—', '≥ 0\u00a0g', '0\u00a0g']);
    render({
      kcal: { status: 'exact', value: 0 },
      carbs: { status: 'exact', value: 0 },
      protein: { status: 'exact', value: 0 },
      fat: { status: 'exact', value: 0 },
    });
    const chart = fixture.debugElement.query(By.directive(MacroChartComponent))
      .componentInstance as MacroChartComponent;
    expect(chart.dataIncompleteOrInvalid()).toBe(true);
    expect(chart.displayedKcal()).toBe('0 kcal');
    expect(element.querySelector('.value-percentage')).toBeNull();
  });

  it('preserves the recipe chart, legend colors and nutritional basis', () => {
    const element = render(nutrition);
    expect(element.querySelector('app-macro-chart')).not.toBeNull();
    expect(element.textContent).toContain('pro Portion');
    expect(element.querySelectorAll('.value-percentage').length).toBe(3);
    const colors = Array.from(element.querySelectorAll<HTMLElement>('.color-indicator'))
      .map(entry => entry.style.getPropertyValue('--color'));
    expect(colors).toEqual(['rgb(19,154,155)', 'rgb(155, 255, 117)', 'rgb(255,97,97)']);
  });

  it('accepts a foodstuff basis without recipe-specific input', () => {
    fixture.componentRef.setInput('basis', 'pro 100 ml');
    expect(render(nutrition).textContent).toContain('pro 100 ml');
  });

  it('keeps known absolute values and labels missing values with a gray chart and no percentages', () => {
    const element = render(toNutritionSummary({ kcal: 120.6, carbs: 0, protein: null, fat: 10 }));
    expect(renderedChart().dataIncompleteOrInvalid()).toBe(true);
    expect(element.querySelector('.value-percentage')).toBeNull();
    expect(renderedChart().nutrition().kcal.value).toBe(120.6);
    expect(element.textContent).toContain('0\u00a0g');
    expect(element.textContent).toContain('10\u00a0g');
    expect(element.querySelector('[aria-label="Protein: Angabe fehlt"]')).not.toBeNull();
  });

  it('shows all zero values with a gray chart and no percentages or missing indicators', () => {
    const element = render(toNutritionSummary({ kcal: 0, carbs: 0, protein: 0, fat: 0 }));
    expect(renderedChart().dataIncompleteOrInvalid()).toBe(true);
    expect(element.querySelector('.value-percentage')).toBeNull();
    expect(element.querySelectorAll('mat-icon').length).toBe(0);
    expect(element.querySelectorAll('.value-absolute').length).toBe(3);
    expect(renderedChart().nutrition().kcal.value).toBe(0);
  });

  it('shows accessible missing indicators when all values are absent', () => {
    const element = render(toNutritionSummary({}));
    expect(renderedChart().dataIncompleteOrInvalid()).toBe(true);
    expect(renderedChart().nutrition().kcal.status).toBe('unknown');
    expect(Array.from(element.querySelectorAll('.value-absolute')).map(el => el.textContent?.trim()))
      .toEqual(['—', '—', '—']);
    expect(element.querySelector('[aria-label="Protein: Angabe fehlt"]')).not.toBeNull();
    expect(element.querySelector('.value-percentage')).toBeNull();
  });

  it('can show a complete macro distribution when calories are missing', () => {
    const element = render({ ...nutrition, kcal: { status: 'unknown', value: null } });
    expect(element.querySelector('app-macro-chart')).not.toBeNull();
    expect(renderedChart().nutrition().kcal.status).toBe('unknown');
  });

  it('updates between complete, missing, zero and restored values without stale percentages', () => {
    render(nutrition);
    expect(render({ ...nutrition, fat: { status: 'unknown', value: null } }).querySelector('.value-percentage')).toBeNull();
    render(toNutritionSummary({ carbs: 0, protein: 0, fat: 0 }));
    expect(renderedChart().dataIncompleteOrInvalid()).toBe(true);
    expect(render(nutrition).querySelectorAll('.value-percentage').length).toBe(3);
  });
});
