import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatInput } from '@angular/material/input';
import { MatCard } from '@angular/material/card';
import { page } from 'vitest/browser';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { FoodstuffFormComponent } from './foodstuff-form.component';

describe('FoodstuffFormComponent nutrition editor layout', () => {
  let fixture: ComponentFixture<FoodstuffFormComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FoodstuffFormComponent],
      providers: [{ provide: FoodstuffImageService, useValue: {} }],
    });
    fixture = TestBed.createComponent(FoodstuffFormComponent);
    fixture.componentRef.setInput('submitLabel', 'Speichern');
    fixture.componentRef.setInput('foodstuff', {
      kcal: 330,
      carbs: 40,
      protein: 20,
      fat: 10,
      fiber: 8.5,
    });
    host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
  });

  afterEach(() => fixture.destroy());

  it('shows the details placeholder at lower emphasis than entered text', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const details = host.querySelector<HTMLInputElement>(
      '[formControlName="details"]',
    );
    if (!details) throw new Error('Expected details input');
    expect(details.value).toBe('');
    expect(details.placeholder).not.toBe('');

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Expected canvas color sampling');
    context.fillStyle = getComputedStyle(details, '::placeholder').color;
    context.fillRect(0, 0, 1, 1);
    expect(context.getImageData(0, 0, 1, 1).data[3]).toBeLessThan(200);

    fixture.componentInstance.form.controls.details.setValue('roh');
    fixture.detectChanges();
    expect(details.value).toBe('roh');
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = getComputedStyle(details).color;
    context.fillRect(0, 0, 1, 1);
    expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(255);
  });

  it.each([280, 320, 400, 640])(
    'keeps editable calories inside the chart and fiber below at %i px',
    async (width) => {
      await page.viewport(800, 1000);
      host.style.width = `${width}px`;
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const editor = host.querySelector<HTMLElement>('.nutrition-wrapper');
      const chart = host.querySelector<HTMLElement>('.chart-editor');
      const calories = host.querySelector<HTMLInputElement>(
        '[formControlName="kcal"]',
      );
      const macros = host.querySelector<HTMLElement>('.macros-wrapper');
      const separator = host.querySelector<HTMLElement>('.nutrition-separator');
      const fiber = host.querySelector<HTMLElement>('.fiber-field');
      if (!editor || !chart || !calories || !macros || !separator || !fiber)
        throw new Error('Expected complete nutrition editor');
      const bounds = editor.getBoundingClientRect();
      const chartBounds = chart.getBoundingClientRect();
      const caloriesBounds = calories.getBoundingClientRect();
      expect(caloriesBounds.left).toBeGreaterThan(chartBounds.left);
      expect(caloriesBounds.right).toBeLessThan(chartBounds.right);
      expect(caloriesBounds.top).toBeGreaterThan(chartBounds.top);
      expect(caloriesBounds.bottom).toBeLessThan(chartBounds.bottom);
      expect(macros.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        chartBounds.right,
      );
      expect(separator.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        Math.max(chartBounds.bottom, macros.getBoundingClientRect().bottom),
      );
      expect(fiber.getBoundingClientRect().top).toBeGreaterThan(
        separator.getBoundingClientRect().bottom,
      );
      expect(separator.getBoundingClientRect().width).toBeCloseTo(
        bounds.width - 32,
        0,
      );
      expect(fiber.getBoundingClientRect().width).toBeCloseTo(
        separator.getBoundingClientRect().width,
        0,
      );
      expect(fiber.querySelector('.color-indicator')).toBeNull();
      for (const input of editor.querySelectorAll<HTMLInputElement>('input')) {
        const inputBounds = input.getBoundingClientRect();
        expect(inputBounds.width).toBeGreaterThan(20);
        expect(inputBounds.left).toBeGreaterThanOrEqual(bounds.left);
        expect(inputBounds.right).toBeLessThanOrEqual(bounds.right);
        expect(input.disabled).toBe(false);
      }
      const renderedChart = fixture.debugElement.query(
        By.directive(MacroChartComponent),
      ).componentInstance as MacroChartComponent;
      const markers = Array.from(
        macros.querySelectorAll<HTMLElement>('.color-indicator'),
      );
      expect(markers).toHaveLength(3);
      expect(
        markers.map((marker) => getComputedStyle(marker).backgroundColor),
      ).toEqual(renderedChart.chart?.data.datasets[0].backgroundColor);
      expect(renderedChart.chart?.data.datasets[0].data).toEqual([40, 20, 10]);
      for (const label of macros.querySelectorAll<HTMLElement>(
        '.nutrient-label',
      )) {
        expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
      }
      const firstMacro = macros.querySelector('app-foodstuff-nutrition-row');
      const macroLabel = firstMacro?.querySelector('.nutrient-label');
      const macroInput = firstMacro?.querySelector('.nutrient-input');
      if (!macroLabel || !macroInput)
        throw new Error('Expected editable macro row');
      if (width < 640) {
        expect(macroInput.getBoundingClientRect().top).toBeGreaterThanOrEqual(
          macroLabel.getBoundingClientRect().bottom,
        );
      } else {
        expect(macroInput.getBoundingClientRect().left).toBeGreaterThan(
          macroLabel.getBoundingClientRect().right,
        );
      }
      const fiberInput = fiber.querySelector('input');
      if (!fiberInput) throw new Error('Expected editable fiber');
      expect(fiberInput.value).toBe('8.5');
      expect(fiberInput.validity.stepMismatch).toBe(false);
      for (const row of fixture.debugElement.queryAll(
        By.css('app-foodstuff-nutrition-row'),
      )) {
        expect(row.query(By.directive(MatCard))).not.toBeNull();
        expect(row.query(By.directive(MatInput))).not.toBeNull();
      }
      expect(
        fixture.debugElement
          .query(By.css('.calories-field'))
          .query(By.directive(MatInput)),
      ).not.toBeNull();
      expect(editor.scrollWidth).toBeLessThanOrEqual(editor.clientWidth);
      expect(calories.getAttribute('aria-label')).toBe('Kalorien');
      expect(host.querySelector('.calories-field')?.textContent?.trim()).toBe(
        'kcal',
      );
    },
  );
});
