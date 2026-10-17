import { TestBed } from '@angular/core/testing';
import { FoodstuffImageService } from '../../../foodstuffs/services/foodstuff-image.service';
import type { RecipePresentation } from '../../models/recipe-presentation';
import { IngredientsGridComponent } from './ingredients-grid.component';

describe('IngredientsGridComponent foodstuff images', () => {
  it('renders catalogue images in ingredient order and uses the placeholder for null image references', async () => {
    const download = vi
      .fn<(id: string) => Promise<{ url: string; expiresIn: number }>>()
      .mockResolvedValue({ url: '/storage/tomato', expiresIn: 300 });
    TestBed.configureTestingModule({
      imports: [IngredientsGridComponent],
      providers: [{ provide: FoodstuffImageService, useValue: { download } }],
    });
    const tomato = {
      imageId: null,
      name: 'Tomate',
      unitVerbose: 'g',
      kcal: 18,
      carbs: 3,
      protein: 1,
      fat: 0,
    };
    const recipe: RecipePresentation = {
      servings: 2,
      preptime: null,
      kcal: { value: null, status: 'unknown' },
      carbs: { value: null, status: 'unknown' },
      protein: { value: null, status: 'unknown' },
      fat: { value: null, status: 'unknown' },
      ingredients: [
        { index: 2, amount: 10, foodstuff: { ...tomato, name: 'Salz' } },
        {
          index: 1,
          amount: 200,
          foodstuff: { ...tomato, imageId: 'tomato-image' },
        },
      ],
      steps: [],
    };
    const fixture = TestBed.createComponent(IngredientsGridComponent);
    fixture.componentRef.setInput('recipe', recipe);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const tomatoImage = element.querySelector<HTMLImageElement>(
      'img[src="/storage/tomato"]',
    )!;
    tomatoImage.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(download).toHaveBeenCalledExactlyOnceWith('tomato-image');
    expect(element.querySelector('app-macro-chart')).toBeNull();
    const images = element.querySelectorAll('app-foodstuff-image img');
    expect(
      Array.from(images).map((image) => image.getAttribute('src')),
    ).toEqual(['/storage/tomato', 'assets/images/question-mark.png']);
    expect(
      Array.from(element.querySelectorAll('.amount')).map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(['200 g', '10 g']);
    expect(element.textContent.indexOf('Tomate')).toBeLessThan(
      element.textContent.indexOf('Salz'),
    );
  });
});
