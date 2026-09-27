import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoodstuffUnit } from '../../../foodstuffs/models/foodstuff-unit';
import { IngredientsGridComponent } from '../ingredients-grid/ingredients-grid.component';
import { RecipeMacroChartCardComponent } from '../recipe-macro-chart-card/recipe-macro-chart-card.component';
import { StepsGridComponent } from '../steps-grid/steps-grid.component';
import { RecipePresentation } from '../../models/recipe-presentation';
import { RecipePresentationComponent } from './recipe-presentation.component';

describe('RecipePresentationComponent', () => {
  let fixture: ComponentFixture<RecipePresentationComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RecipePresentationComponent] });
    fixture = TestBed.createComponent(RecipePresentationComponent);
  });

  it('composes all recipe sections from persistence-independent display data', () => {
    const recipe: RecipePresentation = {
      servings: 2,
      preptime: 25,
      kcal: 450,
      carbs: 50,
      protein: 20,
      fat: 12,
      ingredients: [
        {
          index: 1,
          amount: 200,
          foodstuff: {
            id: 7,
            name: 'Tomaten',
            brand: null,
            unit: FoodstuffUnit.Gram,
            unitVerbose: 'g',
            kcal: 18,
            carbs: 3.9,
            protein: 0.9,
            fat: 0.2,
          },
        },
      ],
      steps: [{ index: 1, description: 'Tomaten schneiden.' }],
    };
    fixture.componentRef.setInput('recipe', recipe);
    fixture.detectChanges();

    const ingredients = fixture.debugElement.query(
      By.directive(IngredientsGridComponent)
    ).componentInstance as IngredientsGridComponent;
    const steps = fixture.debugElement.query(
      By.directive(StepsGridComponent)
    ).componentInstance as StepsGridComponent;
    const nutrition = fixture.debugElement.query(
      By.directive(RecipeMacroChartCardComponent)
    ).componentInstance as RecipeMacroChartCardComponent;

    expect(ingredients.recipe()).toBe(recipe);
    expect(steps.recipe()).toBe(recipe);
    expect(nutrition.recipe()).toBe(recipe);
    expect(fixture.nativeElement.textContent).toContain('Tomaten');
    expect(fixture.nativeElement.textContent).toContain('Tomaten schneiden.');
  });
});
