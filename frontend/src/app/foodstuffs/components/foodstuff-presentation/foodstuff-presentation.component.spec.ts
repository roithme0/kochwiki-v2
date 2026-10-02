import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import { NutritionCardComponent } from '../../../core/components/nutrition-card/nutrition-card.component';
import { FoodstuffPresentationComponent } from './foodstuff-presentation.component';

describe('Foodstuff nutrition presentation', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FoodstuffPresentationComponent] });
    TestBed.overrideComponent(MacroChartComponent, { set: { template: '' } });
  });

  it.each([['G', 'pro 100 g'], ['ML', 'pro 100 ml'], ['PIECE', 'pro St\u00fcck']])(
    'shows the correct basis for %s and updates partial nutrition without stale percentages', (unit, basis) => {
      const fixture = TestBed.createComponent(FoodstuffPresentationComponent);
      fixture.componentRef.setInput('foodstuff', { unit, kcal: 200, carbs: 12, protein: 8, fat: 4 });
      fixture.detectChanges();
      const card = fixture.debugElement.query(By.directive(NutritionCardComponent)).componentInstance as NutritionCardComponent;
      expect(fixture.nativeElement.textContent).toContain(basis);
      expect(card.showChart()).toBe(true);
      fixture.componentRef.setInput('foodstuff', { unit, kcal: 0, carbs: 0, protein: null, fat: null });
      fixture.detectChanges();
      expect(card.showChart()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('0 kcal');
      expect(fixture.nativeElement.textContent).not.toContain('%');
      expect(fixture.nativeElement.querySelectorAll('app-chart-legend-element mat-icon')).toHaveLength(2);
      fixture.destroy();
    },
  );
});
