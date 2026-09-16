import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StepsGridComponent } from './steps-grid.component';
import { RecipePresentation } from '../../models/recipe-presentation';

describe('StepsGridComponent', () => {
  let component: StepsGridComponent;
  let fixture: ComponentFixture<StepsGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StepsGridComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StepsGridComponent);
    component = fixture.componentInstance;
  });

  it('sorts steps by index without mutating the presentation input', () => {
    const recipe: RecipePresentation = {
      servings: 2,
      preptime: null,
      kcal: null,
      carbs: null,
      protein: null,
      fat: null,
      ingredients: [],
      steps: [
        { index: 2, description: 'Second' },
        { index: 1, description: 'First' },
      ],
    };
    fixture.componentRef.setInput('recipe', recipe);
    fixture.detectChanges();

    expect(component.stepsSorted().map((step) => step.index)).toEqual([1, 2]);
    expect(recipe.steps.map((step) => step.index)).toEqual([2, 1]);
  });
});
