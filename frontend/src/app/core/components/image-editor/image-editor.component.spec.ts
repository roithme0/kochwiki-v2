import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { ImageEditorState } from '../../services/image-editor-state.service';
import { ImageEditorComponent } from './image-editor.component';

@Component({
  imports: [ImageEditorComponent],
  providers: [ImageEditorState],
  template:
    '<app-image-editor [state]="image" [placeholder]="placeholder()" />',
})
class EditorHost {
  readonly image = inject(ImageEditorState);
  readonly placeholder = signal('assets/images/question-mark.png');
  readonly source = signal<string | null>(null);
  readonly saving = signal(false);
  readonly upload = vi.fn<(file: File) => Promise<{ id: string }>>();
  readonly download = vi.fn<(id: string) => Promise<{ url: string }>>();

  constructor() {
    this.image.connect(this, this.source, this.saving);
  }
}

describe('ImageEditorComponent', () => {
  let fixture: ComponentFixture<EditorHost>;
  let host: EditorHost;
  let element: HTMLElement;
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi.fn(() => 'blob:preview');
        static override revokeObjectURL = revokeObjectURL;
      },
    );
    TestBed.configureTestingModule({ imports: [EditorHost] });
    fixture = TestBed.createComponent(EditorHost);
    host = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function button(label: string): HTMLButtonElement {
    const found = Array.from(element.querySelectorAll('button')).find(
      (candidate) =>
        candidate.getAttribute('aria-label') === label ||
        candidate.textContent?.trim() === label,
    );
    if (!found) throw new Error('Missing button: ' + label);
    return found;
  }

  function select(type = 'image/png'): void {
    const input = element.querySelector('input')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: { item: () => new File(['image'], 'image.png', { type }) },
    });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it.each([
    'assets/images/question-mark.png',
    'assets/images/recipe-image-placeholder.png',
  ])('keeps the domain placeholder %s and ignores its load failure', (path) => {
    host.placeholder.set(path);
    fixture.detectChanges();
    const image = element.querySelector('img')!;
    expect(image.getAttribute('src')).toBe(path);
    expect(image.alt).toBe('Kein Bild vorhanden');
    image.dispatchEvent(new Event('error'));
    expect(host.image.imageAccessFailed()).toBe(false);
    expect(host.image.imageError()).toBeNull();
    expect(
      button('Bild auswählen')
        .querySelector('mat-icon')
        ?.getAttribute('data-mat-icon-name'),
    ).toContain('add_photo_alternate');
    expect(element.querySelector('[aria-label="Bild entfernen"]')).toBeNull();
  });

  it('opens selection, previews locally, changes add to replace, and removes the image', () => {
    const input = element.querySelector('input')!;
    const click = vi.spyOn(input, 'click');
    button('Bild auswählen').click();
    expect(click).toHaveBeenCalledOnce();
    select();
    expect(element.querySelector('img')?.getAttribute('src')).toBe(
      'blob:preview',
    );
    expect(element.querySelector('img')?.alt).toBe('Bildvorschau');
    expect(
      button('Bild ersetzen')
        .querySelector('mat-icon')
        ?.getAttribute('data-mat-icon-name'),
    ).toContain('edit');
    expect(host.upload).not.toHaveBeenCalled();
    button('Bild entfernen').click();
    fixture.detectChanges();
    expect(element.querySelector('img')?.getAttribute('src')).toBe(
      host.placeholder(),
    );
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:preview');
  });

  it('shows image delivery errors inline and retries with fresh download instructions', async () => {
    host.download
      .mockResolvedValueOnce({ url: '/storage/first.png' })
      .mockResolvedValueOnce({ url: '/storage/retry.png' });
    host.source.set('saved-image');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const preview = element.querySelector('img')!;
    preview.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(
      element.querySelector('.image-actions [role="status"]')?.textContent,
    ).toContain('Bild konnte nicht geladen werden.');
    expect(element.querySelector('img')?.getAttribute('src')).toBe(
      host.placeholder(),
    );
    button('Bild erneut laden').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.download).toHaveBeenCalledTimes(2);
    expect(element.querySelector('img')?.getAttribute('src')).toBe(
      '/storage/retry.png',
    );
    expect(host.image.imageAccessFailed()).toBe(false);
  });

  it('keeps the current preview after invalid selection and discards the error inline', () => {
    select();
    select('image/jpeg');
    expect(
      element.querySelector('.image-actions [role="alert"]')?.textContent,
    ).toContain('PNG');
    expect(element.querySelector('img')?.getAttribute('src')).toBe(
      'blob:preview',
    );
    host.saving.set(true);
    fixture.detectChanges();
    expect(button('Ungültige Auswahl verwerfen').disabled).toBe(true);
    expect(element.querySelector('input')?.disabled).toBe(true);
    button('Bild entfernen').click();
    expect(host.image.imagePreview()).toBe('blob:preview');
    host.saving.set(false);
    fixture.detectChanges();
    button('Ungültige Auswahl verwerfen').click();
    fixture.detectChanges();
    expect(host.image.invalidImageSelection()).toBe(false);
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(host.image.imagePreview()).toBe('blob:preview');
  });

  it('shows upload progress and failure beside disabled image buttons, then allows retry', async () => {
    let reject!: (reason: Error) => void;
    host.upload.mockReturnValueOnce(
      new Promise<{ id: string }>((_, fail) => {
        reject = fail;
      }),
    );
    select();
    const accept = vi.fn();
    const pending = host.image.submit(accept);
    fixture.detectChanges();
    expect(
      element.querySelector('.image-preview')?.getAttribute('aria-busy'),
    ).toBe('true');
    expect(
      element.querySelector('.image-actions [role="status"]')?.textContent,
    ).toContain('Bild wird hochgeladen und geprüft');
    expect(button('Bild ersetzen').disabled).toBe(true);
    expect(button('Bild entfernen').disabled).toBe(true);
    expect(element.querySelector('input')?.disabled).toBe(true);
    reject(new Error('Unavailable'));
    await pending;
    fixture.detectChanges();
    expect(accept).not.toHaveBeenCalled();
    expect(
      element.querySelector('.image-actions [role="alert"]')?.textContent,
    ).toContain('Bitte erneut speichern');
    expect(button('Bild ersetzen').disabled).toBe(false);
    host.upload.mockResolvedValueOnce({ id: 'uploaded-image' });
    await host.image.submit(accept);
    fixture.detectChanges();
    expect(accept).toHaveBeenCalledExactlyOnceWith('uploaded-image');
  });
});
