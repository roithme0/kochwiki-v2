import { expect, type Locator } from '@playwright/test';

export async function expectUploadedImage(
  image: Locator,
  width: number,
  height: number,
): Promise<void> {
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /^\/storage\//);
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => ({
        complete: element.complete,
        width: element.naturalWidth,
        height: element.naturalHeight,
      })),
    )
    .toEqual({ complete: true, width, height });
}
