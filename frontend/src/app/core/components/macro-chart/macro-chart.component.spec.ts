import { toNutritionSummary } from '../../models/nutrition-result';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Chart } from 'chart.js';
import { vi } from 'vitest';
import { MacroChartComponent } from './macro-chart.component';

describe('MacroChartComponent', () => {
  let fixture: ComponentFixture<MacroChartComponent>;

  beforeEach(async () => {
    vi.spyOn(MacroChartComponent.prototype, 'ngAfterViewInit').mockImplementation(() => {});
    await TestBed.configureTestingModule({
      imports: [MacroChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MacroChartComponent);
    const chart: Pick<Chart, 'data' | 'update' | 'destroy'> = {
      data: { datasets: [{ data: [], backgroundColor: [] }] },
      update: vi.fn(),
      destroy: vi.fn(),
    };
    fixture.componentInstance.chart = chart as Chart;
    fixture.componentRef.setInput('nutrition', toNutritionSummary({
      kcal: 420,
      carbs: 40,
      protein: 20,
      fat: 10,
    }));
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('centers the kcal overlay across the full chart area', () => {
    fixture.detectChanges();
    const kcalWrapper = fixture.nativeElement.querySelector(
      '.kcal-wrapper'
    ) as HTMLElement;
    const styles = getComputedStyle(kcalWrapper);

    expect(styles.inset).toBe('0px');
    expect(styles.placeItems).toBe('center');
  });

  it('displays kcal rounded to a whole number', () => {
    fixture.componentRef.setInput('nutrition', toNutritionSummary({
      kcal: 420.6,
      carbs: 40,
      protein: 20,
      fat: 10,
    }));
    fixture.detectChanges();

    const kcal = fixture.nativeElement.querySelector('.kcal') as HTMLElement;
    expect(kcal.textContent?.trim()).toBe('421 kcal');
  });

  it('formats calorie status internally and preserves minimum macros in the legend', () => {
    fixture.componentRef.setInput('nutrition', {
      kcal: { status: 'minimum', value: 420.9 },
      carbs: { status: 'minimum', value: 12 },
      protein: { status: 'exact', value: 6 },
      fat: { status: 'exact', value: 2 },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.kcal').textContent.trim()).toBe('≥ 420 kcal');
    expect(fixture.componentInstance.chart?.data.datasets[0].data).toEqual([1]);
    expect(fixture.componentInstance.legend()['carbs'].value).toEqual({ status: 'minimum', value: 12 });
    expect(Object.values(fixture.componentInstance.legend()).every(entry => entry.valuePercentage === null)).toBe(true);

    fixture.componentRef.setInput('nutrition', {
      kcal: { status: 'unknown', value: null },
      carbs: { status: 'exact', value: 12 },
      protein: { status: 'exact', value: 6 },
      fat: { status: 'exact', value: 2 },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.kcal').textContent.trim()).toBe('— kcal');
    expect(fixture.nativeElement.querySelector('[aria-label="Kalorienangabe fehlt"]')).not.toBeNull();
    expect(fixture.componentInstance.chart?.data.datasets[0].data).toEqual([12, 6, 2]);
    fixture.componentRef.setInput('showKcal', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.kcal-wrapper')).toBeNull();
  });

  it('keeps the nutrient legend when the rendered chart falls back to gray', () => {
    fixture.componentRef.setInput('nutrition', toNutritionSummary({ carbs: 12, protein: null, fat: 0 }));
    fixture.detectChanges();

    const chart = fixture.componentInstance.chart;
    expect(chart?.data.datasets[0].data).toEqual([1]);
    expect(chart?.data.datasets[0].backgroundColor).toEqual(['rgb(200,200,200)']);
    const legend = fixture.componentInstance.legend();
    expect(Object.keys(legend)).toEqual(['carbs', 'protein', 'fat']);
    expect(legend['carbs'].value).toEqual({ status: 'exact', value: 12 });
    expect(legend['protein'].value).toEqual({ status: 'unknown', value: null });
    expect(legend['fat'].value).toEqual({ status: 'exact', value: 0 });
    expect(Object.values(legend).every(entry => entry.valuePercentage === null)).toBe(true);

    fixture.componentRef.setInput('nutrition', toNutritionSummary({ carbs: 12, protein: 6, fat: 2 }));
    fixture.detectChanges();
    expect(fixture.componentInstance.chart).toBe(chart);
    expect(chart?.data.datasets[0].data).toEqual([12, 6, 2]);
    expect(fixture.componentInstance.legend()['carbs'].valuePercentage).toBe(60);

    fixture.componentRef.setInput('nutrition', toNutritionSummary({ carbs: 0, protein: 0, fat: 0 }));
    fixture.detectChanges();
    expect(chart?.data.datasets[0].data).toEqual([1]);
    expect(chart?.data.datasets[0].backgroundColor).toEqual(['rgb(200,200,200)']);
    expect(Object.keys(fixture.componentInstance.legend())).toEqual(['carbs', 'protein', 'fat']);
    expect(Object.values(fixture.componentInstance.legend()).every(entry => entry.valuePercentage === null)).toBe(true);
  });
});
