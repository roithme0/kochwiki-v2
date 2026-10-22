import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ImageEditorState } from './image-editor-state.service';

@Component({ template: '', providers: [ImageEditorState] })
class EditorHost {
  readonly image = inject(ImageEditorState);
}

describe('ImageEditorState ownership and lifecycle', () => {
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi.fn(
          (file: File) => 'blob:' + file.name,
        );
        static override revokeObjectURL = revokeObjectURL;
      },
    );
    TestBed.configureTestingModule({ imports: [EditorHost] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function select(image: ImageEditorState, name: string): void {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: { item: () => new File(['png'], name, { type: 'image/png' }) },
    });
    image.selectImage(input);
  }

  it('isolates selection, upload, save locks and URL cleanup between simultaneous editors', async () => {
    const first = TestBed.createComponent(EditorHost);
    const second = TestBed.createComponent(EditorHost);
    const firstImage = first.componentInstance.image;
    const secondImage = second.componentInstance.image;
    let complete!: (image: { id: string }) => void;
    const upload = vi.fn(
      () =>
        new Promise<{ id: string }>((resolve) => {
          complete = resolve;
        }),
    );
    const secondUpload = vi.fn();
    const saving = signal(false);
    firstImage.connect(
      { upload, download: vi.fn() },
      signal(null),
      signal(false),
    );
    secondImage.connect(
      { upload: secondUpload, download: vi.fn() },
      signal(null),
      saving,
    );
    select(firstImage, 'first.png');
    select(secondImage, 'second.png');
    const accepted = vi.fn();
    const pending = firstImage.submit(accepted);
    saving.set(true);
    secondImage.removeImage();
    await secondImage.submit(vi.fn());
    expect(secondImage.imagePreview()).toBe('blob:second.png');
    expect(secondUpload).not.toHaveBeenCalled();
    saving.set(false);
    secondImage.removeImage();
    expect(secondImage.imageId()).toBeNull();
    expect(firstImage.imagePreview()).toBe('blob:first.png');
    expect(firstImage.busy()).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:second.png');
    second.destroy();
    complete({ id: 'first-image' });
    await pending;
    expect(accepted).toHaveBeenCalledExactlyOnceWith('first-image');
    first.destroy();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:first.png');
  });

  it('clears a removed source image and ignores its pending download', async () => {
    const fixture = TestBed.createComponent(EditorHost);
    const image = fixture.componentInstance.image;
    const source = signal<string | null>('source');
    let complete!: (download: { url: string }) => void;
    const download = vi.fn(
      () =>
        new Promise<{ url: string }>((resolve) => {
          complete = resolve;
        }),
    );
    image.connect({ upload: vi.fn(), download }, source, signal(false));
    fixture.detectChanges();
    expect(download).toHaveBeenCalledExactlyOnceWith('source');
    source.set(null);
    fixture.detectChanges();
    complete({ url: '/stale.png' });
    await fixture.whenStable();
    expect(image.imagePreview()).toBeNull();
    expect(image.imageId()).toBeNull();
    expect(image.loadingImage()).toBe(false);
  });
});
