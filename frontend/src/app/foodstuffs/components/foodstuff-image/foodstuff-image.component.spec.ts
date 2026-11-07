import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { FoodstuffImageComponent } from './foodstuff-image.component';

describe('FoodstuffImageComponent', () => {
  let fixture: ComponentFixture<FoodstuffImageComponent>;
  const contentUrl = vi.fn(
    (id: string) => `/api/foodstuff-images/${id}/content`,
  );
  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const image = (id: string): HTMLImageElement =>
    element().querySelector(`img[src="/api/foodstuff-images/${id}/content"]`)!;

  beforeEach(() => {
    contentUrl.mockClear();
    TestBed.configureTestingModule({
      imports: [FoodstuffImageComponent],
      providers: [{ provide: FoodstuffImageService, useValue: { contentUrl } }],
    });
    fixture = TestBed.createComponent(FoodstuffImageComponent);
  });

  it('shows the placeholder for no image without deriving a URL', () => {
    fixture.componentRef.setInput('imageId', null);
    fixture.detectChanges();
    expect(element().querySelector('img')!.getAttribute('src')).toBe(
      'images/question-mark.png',
    );
    expect(contentUrl).not.toHaveBeenCalled();
  });

  it('shows the placeholder while loading and responds to native load and error', () => {
    fixture.componentRef.setInput('imageId', 'a');
    fixture.detectChanges();
    expect(contentUrl).toHaveBeenCalledExactlyOnceWith('a');
    expect(fixture.componentInstance.loading()).toBe(true);
    expect(
      element().querySelector('img[src="images/question-mark.png"]'),
    ).not.toBeNull();
    image('a').dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
    image('a').dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(
      element().querySelector('img[src="images/question-mark.png"]'),
    ).not.toBeNull();
  });

  it('ignores events for a previous image and after destruction', () => {
    fixture.componentRef.setInput('imageId', 'a');
    fixture.detectChanges();
    const generation = fixture.componentInstance.generation();
    fixture.componentRef.setInput('imageId', 'b');
    fixture.detectChanges();
    fixture.componentInstance.imageLoaded(
      '/api/foodstuff-images/a/content',
      generation,
    );
    fixture.componentInstance.imageLoadFailed(
      '/api/foodstuff-images/a/content',
      generation,
    );
    expect(fixture.componentInstance.loading()).toBe(true);
    expect(fixture.componentInstance.imageUrl()).toBe(
      '/api/foodstuff-images/b/content',
    );
    const current = fixture.componentInstance.generation();
    fixture.destroy();
    fixture.componentInstance.imageLoadFailed(
      '/api/foodstuff-images/b/content',
      current,
    );
    expect(fixture.componentInstance.imageUrl()).toBe(
      '/api/foodstuff-images/b/content',
    );
  });
});
