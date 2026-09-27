import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecipeVersionState } from '../../models/recipe';
import { RecipeVersionStateBadgeComponent } from './recipe-version-state-badge.component';

describe('RecipeVersionStateBadgeComponent', () => {
  let fixture: ComponentFixture<RecipeVersionStateBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecipeVersionStateBadgeComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(RecipeVersionStateBadgeComponent);
  });

  it('renders the matching lifecycle badge and hides its host for an active version', () => {
    expectBadge('draft', 'Entwurf', false);
    expectBadge('historical', 'Archivierte Version', false);
    expectBadge('active', '', true);
  });

  it('renders draft versions as a filled rounded badge', () => {
    fixture.componentRef.setInput('state', 'draft');
    fixture.detectChanges();

    const styles = getComputedStyle(fixture.nativeElement);
    expect(styles.display).toBe('inline-flex');
    expect(styles.borderRadius).toBe('0.5rem');
    expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  function expectBadge(state: RecipeVersionState, expectedText: string, expectedHidden: boolean): void {
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe(expectedText);
    expect(fixture.nativeElement.hidden).toBe(expectedHidden);
  }
});
