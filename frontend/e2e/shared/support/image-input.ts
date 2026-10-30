import { expect, type Locator, type Page } from '@playwright/test';

export class ImageInput {
  readonly placeholder: Locator;
  readonly preview: Locator;
  readonly chooseButton: Locator;
  readonly replaceButton: Locator;
  readonly removeButton: Locator;

  constructor(
    private readonly page: Page,
    container: Locator,
  ) {
    this.placeholder = container.getByRole('img', {
      name: 'Kein Bild vorhanden',
      exact: true,
    });
    this.preview = container.getByRole('img', {
      name: 'Bildvorschau',
      exact: true,
    });
    this.chooseButton = container.getByRole('button', {
      name: 'Bild auswählen',
      exact: true,
    });
    this.replaceButton = container.getByRole('button', {
      name: 'Bild ersetzen',
      exact: true,
    });
    this.removeButton = container.getByRole('button', {
      name: 'Bild entfernen',
      exact: true,
    });
  }

  async expectLoaded(state: 'empty' | 'image'): Promise<void> {
    if (state === 'empty') {
      await expect(this.placeholder).toBeVisible();
      await expect(this.preview).toBeHidden();
      await expect(this.chooseButton).toBeVisible();
      await expect(this.chooseButton).toBeEnabled();
      await expect(this.replaceButton).toBeHidden();
      await expect(this.removeButton).toBeHidden();
    } else {
      await expect(this.preview).toBeVisible();
      await expect
        .poll(() =>
          this.preview.evaluate(
            (image: HTMLImageElement) =>
              image.complete &&
              image.naturalWidth > 0 &&
              image.naturalHeight > 0,
          ),
        )
        .toBe(true);
      await expect(this.placeholder).toBeHidden();
      await expect(this.chooseButton).toBeHidden();
      await expect(this.replaceButton).toBeVisible();
      await expect(this.replaceButton).toBeEnabled();
      await expect(this.removeButton).toBeVisible();
      await expect(this.removeButton).toBeEnabled();
    }
  }

  async expectImageDimensions(width: number, height: number): Promise<void> {
    await expect
      .poll(() =>
        this.preview.evaluate((image: HTMLImageElement) => ({
          complete: image.complete,
          width: image.naturalWidth,
          height: image.naturalHeight,
        })),
      )
      .toEqual({ complete: true, width, height });
  }

  async chooseFile(
    path: string,
    expectedDimensions: { readonly width: number; readonly height: number },
  ): Promise<void> {
    const fileChooser = this.page.waitForEvent('filechooser');
    await this.chooseButton.click();
    await (await fileChooser).setFiles(path);
    await this.expectLoaded('image');
    await this.expectImageDimensions(
      expectedDimensions.width,
      expectedDimensions.height,
    );
  }
}
