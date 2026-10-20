import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { FoodstuffImageDownloadOut } from '../../../core/api/generated';
import { FoodstuffImageService } from '../../services/foodstuff-image.service';
import { FoodstuffImageComponent } from './foodstuff-image.component';

describe('FoodstuffImageComponent', () => {
  let fixture: ComponentFixture<FoodstuffImageComponent>;
  const download = vi.fn<(id: string) => Promise<FoodstuffImageDownloadOut>>();
  const placeholder = 'images/question-mark.png';
  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const visibleSource = (): string | null =>
    Array.from(element().querySelectorAll('img'))
      .find((image) => image.style.visibility !== 'hidden')
      ?.getAttribute('src') ?? null;
  const image = (url: string): HTMLImageElement =>
    element().querySelector<HTMLImageElement>(`img[src="${url}"]`)!;

  beforeEach(() => {
    download.mockReset();
    TestBed.configureTestingModule({
      imports: [FoodstuffImageComponent],
      providers: [{ provide: FoodstuffImageService, useValue: { download } }],
    });
    fixture = TestBed.createComponent(FoodstuffImageComponent);
  });

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the question mark without requesting access for an absent image', async () => {
    fixture.componentRef.setInput('imageId', null);
    fixture.detectChanges();
    await settle();
    expect(visibleSource()).toBe(placeholder);
    expect(download).not.toHaveBeenCalled();
    expect(element().querySelector('button, mat-spinner')).toBeNull();
  });

  it('keeps the placeholder through instruction and byte loading, then displays the image with its accessible label', async () => {
    let resolveDownload!: (value: FoodstuffImageDownloadOut) => void;
    download.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDownload = resolve;
      }),
    );
    fixture.componentRef.setInput('imageId', 'image-a');
    fixture.componentRef.setInput('alt', 'Tomate');
    fixture.detectChanges();
    expect(visibleSource()).toBe(placeholder);
    resolveDownload({ url: '/storage/a', expiresIn: 300 });
    await settle();
    expect(visibleSource()).toBe(placeholder);
    expect(image('/storage/a').style.visibility).toBe('hidden');
    image('/storage/a').dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(visibleSource()).toBe('/storage/a');
    expect(image('/storage/a').alt).toBe('Tomate');
    expect(
      element().querySelector('.image-area')?.getAttribute('aria-busy'),
    ).toBe('false');
  });

  it.each(['access', 'bytes'])(
    'quietly falls back after %s failure without retrying',
    async (failure) => {
      if (failure === 'access')
        download.mockRejectedValueOnce(new Error('unavailable'));
      else
        download.mockResolvedValueOnce({ url: '/storage/a', expiresIn: 300 });
      fixture.componentRef.setInput('imageId', 'image-a');
      fixture.detectChanges();
      await settle();
      if (failure === 'bytes') {
        image('/storage/a').dispatchEvent(new Event('error'));
        fixture.detectChanges();
      }
      expect(visibleSource()).toBe(placeholder);
      expect(fixture.componentInstance.loading()).toBe(false);
      expect(element().querySelector('button, mat-spinner, p')).toBeNull();
      expect(download).toHaveBeenCalledExactlyOnceWith('image-a');
    },
  );

  it.each([null, 'image-b'])(
    'ignores stale access and image events after changing the reference to %s',
    async (nextId) => {
      let resolveFirst!: (value: FoodstuffImageDownloadOut) => void;
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
      await settle();
      resolveFirst({ url: '/storage/a', expiresIn: 300 });
      await settle();
      fixture.componentInstance.imageLoaded('/storage/a');
      fixture.componentInstance.imageLoadFailed('/storage/a');
      expect(fixture.componentInstance.imageUrl()).toBe(
        nextId === null ? null : '/storage/b',
      );
      expect(fixture.componentInstance.loading()).toBe(nextId !== null);
      if (nextId !== null) {
        image('/storage/b').dispatchEvent(new Event('load'));
        fixture.detectChanges();
      }
      expect(visibleSource()).toBe(
        nextId === null ? placeholder : '/storage/b',
      );
    },
  );

  it.each([true, false])(
    'ignores a late request after destruction (success: %s)',
    async (success) => {
      let resolveDownload!: (value: FoodstuffImageDownloadOut) => void;
      let rejectDownload!: (error: Error) => void;
      download.mockReturnValueOnce(
        new Promise((resolve, reject) => {
          resolveDownload = resolve;
          rejectDownload = reject;
        }),
      );
      fixture.componentRef.setInput('imageId', 'image-a');
      fixture.detectChanges();
      fixture.destroy();
      if (success) resolveDownload({ url: '/storage/a', expiresIn: 300 });
      else rejectDownload(new Error('unavailable'));
      await Promise.resolve();
      expect(fixture.componentInstance.imageUrl()).toBeNull();
      expect(fixture.componentInstance.loading()).toBe(true);
    },
  );

  it('keeps loaded bytes after signed URL expiry without refreshing', async () => {
    download.mockResolvedValueOnce({ url: '/storage/a', expiresIn: 300 });
    fixture.componentRef.setInput('imageId', 'image-a');
    fixture.detectChanges();
    await settle();
    image('/storage/a').dispatchEvent(new Event('load'));
    fixture.detectChanges();
    vi.useFakeTimers();
    try {
      await vi.advanceTimersByTimeAsync(301_000);
      expect(visibleSource()).toBe('/storage/a');
      expect(download).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
