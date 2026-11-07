import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DisplayImageComponent } from './display-image.component';

describe('DisplayImageComponent', () => {
  let fixture: ComponentFixture<DisplayImageComponent>;
  const contentUrl = vi.fn(
    (id: string) => `/api/foodstuff-images/${id}/content`,
  );
  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const image = (id: string): HTMLImageElement =>
    element().querySelector(`img[src="/api/foodstuff-images/${id}/content"]`)!;

  beforeEach(() => {
    contentUrl.mockClear();
    TestBed.configureTestingModule({
      imports: [DisplayImageComponent],
    });
    fixture = TestBed.createComponent(DisplayImageComponent);
    fixture.componentRef.setInput('placeholder', 'images/question-mark.png');
  });

  it('shows the placeholder and uses the supplied alt text', () => {
    fixture.componentRef.setInput('alt', 'Pasta');
    fixture.componentRef.setInput('src', null);
    fixture.detectChanges();
    expect(element().querySelector('img')!.getAttribute('src')).toBe(
      'images/question-mark.png',
    );
    expect(element().querySelector('img')!.alt).toBe('Pasta');
  });

  it('shows the placeholder while loading and responds to native load and error', () => {
    fixture.componentRef.setInput('src', contentUrl('a'));
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(true);
    fixture.componentRef.setInput('alt', 'Pasta');
    fixture.detectChanges();
    expect(image('a').alt).toBe('Pasta');
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
    fixture.componentRef.setInput('src', contentUrl('a'));
    fixture.detectChanges();
    const generation = fixture.componentInstance.generation();
    fixture.componentRef.setInput('src', contentUrl('b'));
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
