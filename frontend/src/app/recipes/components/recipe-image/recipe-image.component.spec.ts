import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { RecipeImageService } from '../../services/recipe-image.service';
import { RecipeImageComponent } from './recipe-image.component';

describe('RecipeImageComponent', () => {
  let fixture: ComponentFixture<RecipeImageComponent>;
  const contentUrl = vi.fn((id: string) => `/api/recipe-images/${id}/content`);
  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const image = (id: string): HTMLImageElement =>
    element().querySelector(`img[src="/api/recipe-images/${id}/content"]`)!;

  beforeEach(() => {
    contentUrl.mockClear();
    TestBed.configureTestingModule({
      imports: [RecipeImageComponent],
      providers: [{ provide: RecipeImageService, useValue: { contentUrl } }],
    });
    fixture = TestBed.createComponent(RecipeImageComponent);
  });

  it('shows the placeholder for no image without deriving a URL', () => {
    fixture.componentRef.setInput('imageId', null);
    fixture.detectChanges();
    expect(element().querySelector('img')!.getAttribute('src')).toBe(
      'images/recipe-image-placeholder.png',
    );
    expect(contentUrl).not.toHaveBeenCalled();
  });

  it('shows the placeholder while loading and responds to native load and error', () => {
    fixture.componentRef.setInput('imageId', 'a');
    fixture.detectChanges();
    expect(contentUrl).toHaveBeenCalledExactlyOnceWith('a');
    expect(fixture.componentInstance.loading()).toBe(true);
    expect(
      element().querySelector('img[src="images/recipe-image-placeholder.png"]'),
    ).not.toBeNull();
    image('a').dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
    image('a').dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(
      element().querySelector('img[src="images/recipe-image-placeholder.png"]'),
    ).not.toBeNull();
  });

  it('ignores events for a previous image and after destruction', () => {
    fixture.componentRef.setInput('imageId', 'a');
    fixture.detectChanges();
    const generation = fixture.componentInstance.generation();
    fixture.componentRef.setInput('imageId', 'b');
    fixture.detectChanges();
    fixture.componentInstance.imageLoaded(
      '/api/recipe-images/a/content',
      generation,
    );
    fixture.componentInstance.imageLoadFailed(
      '/api/recipe-images/a/content',
      generation,
    );
    expect(fixture.componentInstance.loading()).toBe(true);
    expect(fixture.componentInstance.imageUrl()).toBe(
      '/api/recipe-images/b/content',
    );
    const current = fixture.componentInstance.generation();
    fixture.destroy();
    fixture.componentInstance.imageLoadFailed(
      '/api/recipe-images/b/content',
      current,
    );
    expect(fixture.componentInstance.imageUrl()).toBe(
      '/api/recipe-images/b/content',
    );
  });

  it('retries the same URL and ignores an event from the failed generation', () => {
    fixture.componentRef.setInput('imageId', 'a');
    fixture.componentRef.setInput('naturalHeight', true);
    fixture.componentRef.setInput('imageDimensions', {
      width: 600,
      height: 1200,
    });
    fixture.detectChanges();
    const generation = fixture.componentInstance.generation();
    const failedImage = image('a');
    failedImage.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    const button = element().querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Bild erneut laden');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(click);
    fixture.detectChanges();
    expect(click.defaultPrevented).toBe(true);
    expect(image('a')).not.toBe(failedImage);
    expect(
      element().querySelector<HTMLElement>('.image-area')!.style.aspectRatio,
    ).toBe('600 / 1200');
    fixture.componentInstance.imageLoadFailed(
      '/api/recipe-images/a/content',
      generation,
    );
    expect(fixture.componentInstance.failed()).toBe(false);
    expect(fixture.componentInstance.loading()).toBe(true);
  });
});
