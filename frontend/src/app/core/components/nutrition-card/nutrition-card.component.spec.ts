import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NutritionValues } from '../../models/nutrition-values';
import { MacroChartComponent } from '../macro-chart/macro-chart.component';
import { NutritionCardComponent } from './nutrition-card.component';

describe('NutritionCardComponent', () => {
  let fixture: ComponentFixture<NutritionCardComponent>;
  const nutrition: NutritionValues = { kcal: 330, carbs: 40, protein: 20, fat: 10 };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NutritionCardComponent] });
    TestBed.overrideComponent(MacroChartComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(NutritionCardComponent);
    fixture.componentRef.setInput('basis', 'pro Portion');
  });

  function render(value: NutritionValues): HTMLElement {
    fixture.componentRef.setInput('nutrition', value);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

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

  it('keeps known absolute values and labels missing values without a chart or percentages', () => {
    const element = render({ kcal: 120.6, carbs: 0, protein: null, fat: 10 });
    expect(element.querySelector('app-macro-chart')).toBeNull();
    expect(element.querySelector('.value-percentage')).toBeNull();
    expect(element.textContent).toContain('121 kcal');
    expect(element.textContent).toContain('0\u00a0g');
    expect(element.textContent).toContain('10\u00a0g');
    expect(element.querySelector('[aria-label="Protein: Angabe fehlt"]')).not.toBeNull();
  });

  it('shows all zero values without a chart, percentages or missing indicators', () => {
    const element = render({ kcal: 0, carbs: 0, protein: 0, fat: 0 });
    expect(element.querySelector('app-macro-chart')).toBeNull();
    expect(element.querySelector('.value-percentage')).toBeNull();
    expect(element.querySelectorAll('mat-icon').length).toBe(0);
    expect(element.querySelectorAll('.value-absolute').length).toBe(3);
    expect(element.textContent).toContain('0 kcal');
  });

  it('shows accessible missing indicators when all values are absent', () => {
    const element = render({});
    expect(element.querySelector('app-macro-chart')).toBeNull();
    expect(element.querySelectorAll('mat-icon[aria-label]').length).toBe(4);
    expect(element.querySelector('.value-percentage')).toBeNull();
  });

  it('can show a complete macro distribution when calories are missing', () => {
    const element = render({ ...nutrition, kcal: null });
    expect(element.querySelector('app-macro-chart')).not.toBeNull();
    expect(element.querySelector('[aria-label="Kalorienangabe fehlt"]')).not.toBeNull();
  });

  it('updates between complete, missing, zero and restored values without stale percentages', () => {
    render(nutrition);
    expect(render({ ...nutrition, fat: null }).querySelector('.value-percentage')).toBeNull();
    expect(render({ carbs: 0, protein: 0, fat: 0 }).querySelector('app-macro-chart')).toBeNull();
    expect(render(nutrition).querySelectorAll('.value-percentage').length).toBe(3);
  });
});
