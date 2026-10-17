import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { Signal } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialogRef } from '@angular/material/dialog';

export interface ImageEditorClient {
  upload(file: File): Promise<{ id: string }>;
  download(imageId: string): Promise<{ url: string }>;
}

interface ImageEditorContext {
  client: ImageEditorClient;
  sourceImageId: Signal<string | null>;
  submitting: Signal<boolean>;
}

@Injectable()
export class ImageEditorState {
  private readonly destroyRef = inject(DestroyRef);
  private readonly context = signal<ImageEditorContext | null>(null);
  private readonly preparing = signal(false);
  private readonly preparationChanges = new Subject<boolean>();
  readonly preparingChanged = this.preparationChanges.asObservable();
  readonly uploadingImage = signal(false);
  readonly busy = computed(
    () => this.preparing() || this.context()?.submitting() === true,
  );
  readonly imagePreview = signal<string | null>(null);
  readonly imageError = signal<string | null>(null);
  readonly invalidImageSelection = signal(false);
  readonly imageAccessFailed = signal(false);
  readonly loadingImage = signal(false);
  private readonly selectedImageId = signal<string | null | undefined>(
    undefined,
  );
  private readonly selectedFile = signal<File | null>(null);
  readonly imageId = computed(() => {
    const selected = this.selectedImageId();
    return selected === undefined
      ? (this.context()?.sourceImageId() ?? null)
      : selected;
  });
  readonly hasImage = computed(
    () => this.selectedFile() !== null || this.imageId() !== null,
  );
  private localPreviewUrl: string | null = null;
  private previewRequest = 0;
  private closing = false;

  constructor() {
    const dialogRef = inject<MatDialogRef<unknown>>(MatDialogRef, {
      optional: true,
    });
    dialogRef
      ?.beforeClosed?.()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.closing = true;
        this.previewRequest++;
      });
    effect(() => {
      const source = this.context()?.sourceImageId();
      untracked(() => {
        if (
          this.selectedImageId() !== undefined ||
          this.selectedFile() !== null
        )
          return;
        this.previewRequest++;
        this.imagePreview.set(null);
        this.imageAccessFailed.set(false);
        this.loadingImage.set(false);
        if (source) void this.loadImagePreview();
      });
    });
    this.destroyRef.onDestroy(() => {
      this.previewRequest++;
      this.releaseLocalPreview();
      this.preparationChanges.complete();
    });
  }

  connect(
    client: ImageEditorClient,
    sourceImageId: Signal<string | null>,
    submitting: Signal<boolean>,
  ): void {
    this.context.set({ client, sourceImageId, submitting });
  }

  async submit(
    accept: (imageIdChange: string | null | undefined) => void,
  ): Promise<void> {
    if (
      this.busy() ||
      this.invalidImageSelection() ||
      this.destroyRef.destroyed ||
      this.closing
    )
      return;
    const client = this.context()?.client;
    if (!client) throw new Error('Image editor has not been connected');
    this.preparing.set(true);
    this.preparationChanges.next(true);
    try {
      const file = this.selectedFile();
      if (file !== null) {
        this.uploadingImage.set(true);
        this.imageError.set(null);
        try {
          const image = await client.upload(file);
          if (this.destroyRef.destroyed || this.closing) return;
          this.selectedImageId.set(image.id);
          this.selectedFile.set(null);
        } catch {
          if (!this.destroyRef.destroyed)
            this.imageError.set(
              'Bild konnte nicht hochgeladen oder validiert werden. Bitte erneut speichern oder ein anderes PNG auswählen.',
            );
          return;
        }
      }
      if (!this.destroyRef.destroyed && !this.closing)
        accept(this.selectedImageId());
    } finally {
      this.uploadingImage.set(false);
      this.preparing.set(false);
      if (!this.destroyRef.destroyed) this.preparationChanges.next(false);
    }
  }

  selectImage(input: HTMLInputElement): void {
    const file = input.files?.item(0);
    input.value = '';
    if (!file || this.busy() || this.destroyRef.destroyed || this.closing)
      return;
    if (
      file.size === 0 ||
      file.size > 10 * 1024 * 1024 ||
      (file.type !== 'image/png' &&
        !(file.type === '' && file.name.toLowerCase().endsWith('.png')))
    ) {
      this.imageError.set('Bitte ein PNG mit höchstens 10 MiB auswählen.');
      this.invalidImageSelection.set(true);
      return;
    }
    this.previewRequest++;
    this.releaseLocalPreview();
    this.localPreviewUrl = URL.createObjectURL(file);
    this.imagePreview.set(this.localPreviewUrl);
    this.selectedFile.set(file);
    this.selectedImageId.set(undefined);
    this.clearErrors();
  }

  removeImage(): void {
    if (this.busy() || this.destroyRef.destroyed || this.closing) return;
    this.previewRequest++;
    this.releaseLocalPreview();
    this.selectedFile.set(null);
    this.selectedImageId.set(null);
    this.imagePreview.set(null);
    this.clearErrors();
  }

  discardInvalidSelection(): void {
    if (this.busy()) return;
    this.invalidImageSelection.set(false);
    this.imageError.set(null);
  }

  imageLoadFailed(): void {
    this.imagePreview.set(null);
    if (this.localPreviewUrl !== null)
      this.imageError.set(
        'Bildvorschau nicht verfügbar. Beim Speichern wird das PNG geprüft.',
      );
    else this.imageAccessFailed.set(true);
  }

  async loadImagePreview(): Promise<void> {
    const imageId = this.imageId();
    const client = this.context()?.client;
    if (
      !client ||
      imageId === null ||
      this.selectedFile() !== null ||
      this.busy() ||
      this.destroyRef.destroyed ||
      this.closing
    )
      return;
    const request = ++this.previewRequest;
    this.loadingImage.set(true);
    this.imageAccessFailed.set(false);
    try {
      const download = await client.download(imageId);
      if (!this.destroyRef.destroyed && request === this.previewRequest)
        this.imagePreview.set(download.url);
    } catch {
      if (!this.destroyRef.destroyed && request === this.previewRequest)
        this.imageAccessFailed.set(true);
    } finally {
      if (!this.destroyRef.destroyed && request === this.previewRequest)
        this.loadingImage.set(false);
    }
  }

  private clearErrors(): void {
    this.imageError.set(null);
    this.invalidImageSelection.set(false);
    this.imageAccessFailed.set(false);
    this.loadingImage.set(false);
  }

  private releaseLocalPreview(): void {
    if (this.localPreviewUrl !== null)
      URL.revokeObjectURL(this.localPreviewUrl);
    this.localPreviewUrl = null;
  }
}
