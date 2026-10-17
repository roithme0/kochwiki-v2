import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { RecipeImageDownloadOut } from '../../../core/api/generated';
import { RecipeImageService } from '../../services/recipe-image.service';
import { RecipeImageComponent } from './recipe-image.component';

describe('RecipeImageComponent', () => {
  let fixture: ComponentFixture<RecipeImageComponent>;
  const download =
    vi.fn<(imageId: string) => Promise<RecipeImageDownloadOut>>();
  const placeholder = 'assets/images/recipe-image-placeholder.png';

  const renderedSource = (): string | null =>
    (fixture.nativeElement as HTMLElement)
      .querySelector('img')!
      .getAttribute('src');

  beforeEach(() => {
    download.mockReset();
    TestBed.configureTestingModule({
      imports: [RecipeImageComponent],
      providers: [{ provide: RecipeImageService, useValue: { download } }],
    });
    fixture = TestBed.createComponent(RecipeImageComponent);
  });

  it('uses the shared placeholder without requesting access when no image exists', async () => {
    fixture.componentRef.setInput('imageId', null);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(renderedSource()).toBe(placeholder);
    expect(download).not.toHaveBeenCalled();
    expect(fixture.componentInstance.failed()).toBe(false);
  });

  it('loads the selected image and keeps it displayed after URL expiry without refreshing', async () => {
    download.mockResolvedValue({ url: '/storage/image', expiresIn: 300 });
    fixture.componentRef.setInput('imageId', 'image-a');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(renderedSource()).toBe('/storage/image');
    expect(download).toHaveBeenCalledExactlyOnceWith('image-a');
    vi.useFakeTimers();
    try {
      await vi.advanceTimersByTimeAsync(301_000);
      expect(renderedSource()).toBe('/storage/image');
      expect(download).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['access', 'bytes'])(
    'falls back after %s failure and obtains fresh access on explicit retry',
    async (failure) => {
      if (failure === 'access')
        download.mockRejectedValueOnce(new Error('unavailable'));
      else
        download.mockResolvedValueOnce({
          url: '/storage/expired',
          expiresIn: 300,
        });
      download.mockResolvedValueOnce({ url: '/storage/fresh', expiresIn: 300 });
      fixture.componentRef.setInput('imageId', 'image-a');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      if (failure === 'bytes') {
        (fixture.nativeElement as HTMLElement)
          .querySelector('img')!
          .dispatchEvent(new Event('error'));
        fixture.detectChanges();
      }
      expect(renderedSource()).toBe(placeholder);
      expect(download).toHaveBeenCalledTimes(1);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[role="status"]')!
          .textContent,
      ).toContain('konnte nicht geladen werden');
      const retry = (fixture.nativeElement as HTMLElement).querySelector(
        'button',
      )!;
      expect(retry.getAttribute('aria-label')).toBe('Bild erneut laden');
      expect(retry.querySelector('mat-icon')?.getAttribute('fontIcon')).toBe(
        'refresh',
      );
      (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(download).toHaveBeenCalledTimes(2);
      expect(renderedSource()).toBe('/storage/fresh');
      expect(fixture.componentInstance.failed()).toBe(false);
    },
  );

  it.each([null, 'image-b'])(
    'ignores a stale result after changing the image to %s',
    async (nextId) => {
      let resolveFirst!: (value: RecipeImageDownloadOut) => void;
      download.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      );
      download.mockResolvedValueOnce({ url: '/storage/b', expiresIn: 300 });
      fixture.componentRef.setInput('imageId', 'image-a');
      fixture.detectChanges();
      fixture.componentRef.setInput('imageId', nextId);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      resolveFirst({ url: '/storage/a', expiresIn: 300 });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(renderedSource()).toBe(
        nextId === null ? placeholder : '/storage/b',
      );
      expect(fixture.componentInstance.loading()).toBe(nextId !== null);
    },
  );

  it('ignores a response after the view is destroyed', async () => {
    let resolveDownload!: (value: RecipeImageDownloadOut) => void;
    download.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDownload = resolve;
      }),
    );
    fixture.componentRef.setInput('imageId', 'image-a');
    fixture.detectChanges();
    fixture.destroy();
    resolveDownload({ url: '/storage/a', expiresIn: 300 });
    await Promise.resolve();
    expect(fixture.componentInstance.imageUrl()).toBeNull();
  });

  it('keeps the empty plate visible during access and byte loading without a spinner or retry button', async () => {
    let resolveDownload!: (value: RecipeImageDownloadOut) => void;
    download.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDownload = resolve;
      }),
    );
    fixture.componentRef.setInput('imageId', 'image-a');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('mat-spinner, button')).toBeNull();
    expect(renderedSource()).toBe(placeholder);
    resolveDownload({ url: '/storage/a', expiresIn: 300 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('mat-spinner, button')).toBeNull();
    expect(element.querySelector(`img[src="${placeholder}"]`)).not.toBeNull();
    expect(element.querySelector('img')!.style.visibility).toBe('hidden');
    expect(renderedSource()).toBe('/storage/a');
    element.querySelector('img')!.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(element.querySelector('mat-spinner')).toBeNull();
    expect(element.querySelector('img')!.style.visibility).toBe('visible');
    expect(element.querySelector(`img[src="${placeholder}"]`)).toBeNull();
    expect(element.querySelector('[role="status"]')).toBeNull();
  });

  it('prevents retry clicks from navigating the surrounding recipe link', async () => {
    download.mockRejectedValueOnce(new Error('unavailable'));
    download.mockResolvedValueOnce({ url: '/storage/fresh', expiresIn: 300 });
    fixture.componentRef.setInput('imageId', 'image-a');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const bubbledClick = vi.fn();
    const element = fixture.nativeElement as HTMLElement;
    element.addEventListener('click', bubbledClick);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    element.querySelector('button')!.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(bubbledClick).not.toHaveBeenCalled();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(renderedSource()).toBe('/storage/fresh');
  });

  it.each([
    { width: 1254, height: 818 },
    { width: 600, height: 1200 },
  ])(
    'reserves the same aspect ratio during access, byte loading, failure and retry: %o',
    async (dimensions) => {
      download.mockResolvedValue({ url: '/storage/a', expiresIn: 300 });
      fixture.componentRef.setInput('naturalHeight', true);
      fixture.componentRef.setInput('imageDimensions', dimensions);
      fixture.componentRef.setInput('imageId', 'image-a');
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const area = element.querySelector<HTMLElement>('.image-area')!;
      const ratio = `${dimensions.width} / ${dimensions.height}`;
      expect(area.style.aspectRatio).toBe(ratio);
      await fixture.whenStable();
      fixture.detectChanges();
      const image = element.querySelector('img')!;
      expect(image.getAttribute('width')).toBe(String(dimensions.width));
      expect(image.getAttribute('height')).toBe(String(dimensions.height));
      expect(area.style.aspectRatio).toBe(ratio);
      image.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(area.style.aspectRatio).toBe(ratio);
      expect(element.querySelector('button')).not.toBeNull();
      element.querySelector('button')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(area.style.aspectRatio).toBe(ratio);
      element.querySelector('img')!.dispatchEvent(new Event('load'));
      fixture.detectChanges();
      expect(area.style.aspectRatio).toBe(ratio);
      expect(element.querySelector('mat-spinner')).toBeNull();
    },
  );

  it('reserves the placeholder aspect ratio before its bytes load', () => {
    fixture.componentRef.setInput('naturalHeight', true);
    fixture.componentRef.setInput('imageId', null);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(
      element.querySelector<HTMLElement>('.image-area')!.style.aspectRatio,
    ).toBe('1254 / 747');
    expect(element.querySelector('img')!.getAttribute('width')).toBe('1254');
    expect(element.querySelector('img')!.getAttribute('height')).toBe('747');
  });

  it('ignores load and error events from a previously selected image', async () => {
    download.mockResolvedValueOnce({ url: '/storage/a', expiresIn: 300 });
    download.mockResolvedValueOnce({ url: '/storage/b', expiresIn: 300 });
    fixture.componentRef.setInput('imageId', 'image-a');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentRef.setInput('imageId', 'image-b');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.imageLoaded('/storage/a');
    fixture.componentInstance.imageLoadFailed('/storage/a');
    expect(fixture.componentInstance.loading()).toBe(true);
    expect(fixture.componentInstance.failed()).toBe(false);
    expect(renderedSource()).toBe('/storage/b');
  });
});
