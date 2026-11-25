import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MacroChartComponent } from '../../../core/components/macro-chart/macro-chart.component';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { FoodstuffPresentationComponent } from './foodstuff-presentation.component';

describe('Foodstuff nutrition presentation', () => {
  const contentUrl = vi.fn((id: string) => `/images/${id}`);

  beforeEach(() => {
    contentUrl.mockClear();
    TestBed.configureTestingModule({
      imports: [FoodstuffPresentationComponent],
      providers: [{ provide: FoodstuffImageService, useValue: { contentUrl } }],
    });
    TestBed.overrideComponent(MacroChartComponent, { set: { template: '' } });
  });

  it.each([
    ['G', 'pro 100 g'],
    ['ML', 'pro 100 ml'],
    ['PIECE', 'pro St\u00fcck'],
  ])(
    'shows the correct basis for %s and updates partial nutrition without stale percentages',
    (unit, basis) => {
      const fixture = TestBed.createComponent(FoodstuffPresentationComponent);
      fixture.componentRef.setInput('foodstuff', {
        imageId: null,
        unit,
        kcal: 200,
        carbs: 12,
        protein: 8,
        fat: 4,
        fiber: null,
      });
      fixture.detectChanges();
      const chart = fixture.debugElement.query(
        By.directive(MacroChartComponent),
      ).componentInstance as MacroChartComponent;
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        basis,
      );
      expect(chart.dataIncompleteOrInvalid()).toBe(false);
      fixture.componentRef.setInput('foodstuff', {
        imageId: null,
        unit,
        kcal: 0,
        carbs: 0,
        protein: null,
        fat: null,
        fiber: null,
      });
      fixture.detectChanges();
      expect(chart.dataIncompleteOrInvalid()).toBe(true);
      expect(chart.nutrition().kcal.value).toBe(0);
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
        '%',
      );
      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll(
          'app-chart-legend-element [aria-label], app-nutrition-value [aria-label]',
        ),
      ).toHaveLength(3);
      fixture.destroy();
    },
  );

  it('resolves the image above nutrition and falls back to the placeholder when absent', () => {
    const fixture = TestBed.createComponent(FoodstuffPresentationComponent);
    const foodstuff = {
      imageId: '123e4567-e89b-42d3-a456-426614174000',
      unit: 'G' as const,
      kcal: 0,
      carbs: null,
      protein: null,
      fat: null,
      fiber: null,
    };
    fixture.componentRef.setInput('foodstuff', foodstuff);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(contentUrl).toHaveBeenCalledWith(foodstuff.imageId);
    expect(
      host.querySelector('app-display-image img')?.getAttribute('src'),
    ).toBe(`/images/${foodstuff.imageId}`);
    const image = host.querySelector('app-display-image');
    const card = host.querySelector('app-nutrition-card');
    expect(image).not.toBeNull();
    expect(card).not.toBeNull();
    expect(
      image!.compareDocumentPosition(card!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fixture.componentRef.setInput('foodstuff', { ...foodstuff, imageId: null });
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    expect(
      host.querySelector('app-display-image img')?.getAttribute('src'),
    ).toBe('images/question-mark.png');
    expect(contentUrl).toHaveBeenCalledTimes(1);
  });
});
