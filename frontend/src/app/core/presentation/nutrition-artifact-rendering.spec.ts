import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MacroChartComponent } from '../components/macro-chart/macro-chart.component';
import { NutritionCardComponent } from '../components/nutrition-card/nutrition-card.component';
import { mapConversationArtifact } from '../../recipes/conversation/recipe-conversation-contract';
import { conversationProposal } from '../../recipes/conversation/recipe-conversation.fixtures';
import {
  isNutritionPresentation,
  nutritionBasisLabel,
} from './nutrition-artifact';

describe('Standalone nutrition artifact rendering', () => {
  it('preserves lower bounds, zeros and unknowns through artifact mapping into the shared card', () => {
    TestBed.configureTestingModule({ imports: [NutritionCardComponent] });
    TestBed.overrideComponent(MacroChartComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(NutritionCardComponent);
    const artifact = mapConversationArtifact({
      ...conversationProposal(),
      type: 'kochwiki-nutrition',
      payload: {
        title: 'Suppe',
        payload: {
          basis: 'whole-recipe',
          kcal: { status: 'minimum', value: 200.9 },
          carbs: { status: 'exact', value: 12 },
          protein: { status: 'minimum', value: 0 },
          fat: { status: 'unknown', value: null },
        },
      },
    });
    expect(artifact.type).toBe('kochwiki-nutrition');
    const payload: unknown = artifact.payload;
    expect(isNutritionPresentation(payload)).toBe(true);
    if (!isNutritionPresentation(payload))
      throw new Error('Expected nutrition presentation');
    fixture.componentRef.setInput('nutrition', payload);
    fixture.componentRef.setInput('basis', nutritionBasisLabel(payload.basis));
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const chart = fixture.debugElement.query(By.directive(MacroChartComponent))
      .componentInstance as MacroChartComponent;
    expect(chart.displayedKcal()).toBe('≥ 200 kcal');
    expect(chart.dataIncompleteOrInvalid()).toBe(true);
    expect(element.textContent).toContain('gesamtes Rezept');
    expect(
      Array.from(element.querySelectorAll('.value-absolute')).map((el) =>
        el.textContent?.trim(),
      ),
    ).toEqual(['12\u00a0g', '≥ 0\u00a0g', '—']);
    expect(element.querySelector('.value-percentage')).toBeNull();
  });
});
