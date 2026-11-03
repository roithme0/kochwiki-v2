import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { toNutritionSummary } from '../../models/nutrition-result';
import { MacroChartComponent } from '../macro-chart/macro-chart.component';
import { NutritionCardComponent } from './nutrition-card.component';

describe('NutritionCardComponent legend layout', () => {
  let fixture: ComponentFixture<NutritionCardComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(NutritionCardComponent);
    host = fixture.nativeElement as HTMLElement;
    host.style.display = 'block';
    fixture.componentRef.setInput('basis', 'pro Portion');
    fixture.componentRef.setInput(
      'nutrition',
      toNutritionSummary({
        kcal: 330,
        carbs: 40,
        protein: 20,
        fat: 10,
        fiber: 8.25,
      }),
    );
  });

  afterEach(() => fixture.destroy());

  it.each([480, 448, 390, 190])(
    'keeps fiber separate and values readable at %i px',
    async (width) => {
      host.style.width = `${width}px`;
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const legend = host.querySelector<HTMLElement>('.legend');
      if (!legend) throw new Error('Expected nutrition legend');
      const rows = Array.from(
        legend.querySelectorAll<HTMLElement>('app-chart-legend-element'),
      );
      expect(rows).toHaveLength(3);
      const fiber = legend.querySelector<HTMLElement>('app-nutrition-value');
      const separator = legend.querySelector<HTMLElement>(
        'hr.nutrition-separator',
      );
      if (!fiber || !separator)
        throw new Error('Expected independent fiber value and separator');
      expect(fiber.textContent).toContain('Ballaststoffe');
      expect(fiber.querySelector('.value-absolute')?.textContent?.trim()).toBe(
        '8.3\u00a0g',
      );
      expect(fiber.querySelector('.color-indicator')).toBeNull();
      expect(fiber.querySelector('.value-percentage')).toBeNull();
      expect(
        parseFloat(getComputedStyle(separator).borderTopWidth),
      ).toBeGreaterThan(0);
      expect(separator.getBoundingClientRect().top).toBeGreaterThan(
        rows[2].getBoundingClientRect().bottom,
      );
      expect(fiber.getBoundingClientRect().top).toBeGreaterThan(
        rows[2].getBoundingClientRect().bottom,
      );

      const chart = fixture.debugElement.query(
        By.directive(MacroChartComponent),
      ).componentInstance as MacroChartComponent;
      const markers = Array.from(
        legend.querySelectorAll<HTMLElement>('.color-indicator'),
      );
      expect(
        markers.map((marker) => getComputedStyle(marker).backgroundColor),
      ).toEqual(chart.chart?.data.datasets[0].backgroundColor);
      for (const marker of markers) {
        const bounds = marker.getBoundingClientRect();
        expect(bounds.width).toBeGreaterThan(0);
        expect(bounds.width).toBe(bounds.height);
        expect(getComputedStyle(marker).borderRadius).toBe('50%');
      }

      const bounds = legend.getBoundingClientRect();
      for (const entry of legend.querySelectorAll<HTMLElement>(
        '.display-name, .value-percentage, .value-absolute',
      )) {
        const entryBounds = entry.getBoundingClientRect();
        expect(entryBounds.left).toBeGreaterThanOrEqual(bounds.left);
        expect(entryBounds.right).toBeLessThanOrEqual(bounds.right);
        expect(entry.scrollWidth).toBeLessThanOrEqual(entry.clientWidth);
      }
      for (const row of rows) {
        const label = row.querySelector<HTMLElement>('.display-name');
        const value = row.querySelector<HTMLElement>('.value-absolute');
        const percentage = row.querySelector<HTMLElement>('.value-percentage');
        const marker = row.querySelector<HTMLElement>('.color-indicator');
        if (!label || !value || !percentage || !marker)
          throw new Error('Expected complete macro legend row');
        const labelBounds = label.getBoundingClientRect();
        const valueBounds = value.getBoundingClientRect();
        const percentageBounds = percentage.getBoundingClientRect();
        expect(valueBounds.left).toBeGreaterThanOrEqual(percentageBounds.right);
        expect(valueBounds.top).toBeCloseTo(percentageBounds.top, 0);
        if (width > 190) {
          expect(labelBounds.left).toBeGreaterThanOrEqual(
            marker.getBoundingClientRect().right,
          );
          expect(percentageBounds.left).toBeGreaterThanOrEqual(
            labelBounds.right,
          );
          expect(valueBounds.top).toBeCloseTo(labelBounds.top, 0);
          expect(row.getBoundingClientRect().height).toBeLessThan(64);
        } else {
          expect(valueBounds.top).toBeGreaterThanOrEqual(labelBounds.bottom);
        }
      }
    },
  );
});
