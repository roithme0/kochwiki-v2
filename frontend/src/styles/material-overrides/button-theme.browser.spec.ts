import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { page } from 'vitest/browser';

@Component({
  imports: [MatButtonModule],
  template: `
    <button mat-flat-button>Flat</button>
    <button mat-mini-fab aria-label="FAB">+</button>
    <button mat-flat-button disabled>Disabled flat</button>
    <button mat-mini-fab disabled aria-label="Disabled FAB">+</button>
    <button mat-stroked-button>Outlined</button>
    <button mat-flat-button aria-label="Short"></button>
    <button matButton="tonal">Tonal</button>
  `,
})
class ButtonThemeHost {}

describe('Flat button theme', () => {
  it('matches mini FAB colors, shape and elevation in normal, hover and disabled states', async () => {
    const fixture = TestBed.createComponent(ButtonThemeHost);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const buttons = host.querySelectorAll<HTMLButtonElement>('button');
    const [flat, fab, disabledFlat, disabledFab, outlined, short, tonal] =
      buttons;
    const compare = (first: HTMLElement, second: HTMLElement): void => {
      const a = getComputedStyle(first);
      const b = getComputedStyle(second);
      expect(a.backgroundColor).toBe(b.backgroundColor);
      expect(a.color).toBe(b.color);
      expect(a.borderRadius).toBe(b.borderRadius);
      expect(a.boxShadow).toBe(b.boxShadow);
    };

    compare(flat, fab);
    compare(disabledFlat, disabledFab);
    expect(short.getBoundingClientRect().width).toBeGreaterThanOrEqual(
      fab.getBoundingClientRect().width,
    );
    expect(short.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      fab.getBoundingClientRect().height,
    );
    expect(getComputedStyle(outlined).backgroundColor).not.toBe(
      getComputedStyle(flat).backgroundColor,
    );
    expect(getComputedStyle(tonal).borderRadius).toBe(
      getComputedStyle(flat).borderRadius,
    );
    const colorReference = document.createElement('span');
    colorReference.style.backgroundColor =
      'var(--mat-button-tonal-container-color)';
    colorReference.style.color = 'var(--mat-button-tonal-label-text-color)';
    host.append(colorReference);
    expect(getComputedStyle(tonal).backgroundColor).toBe(
      getComputedStyle(colorReference).backgroundColor,
    );
    expect(getComputedStyle(tonal).color).toBe(
      getComputedStyle(colorReference).color,
    );
    expect(getComputedStyle(tonal).backgroundColor).not.toBe(
      getComputedStyle(flat).backgroundColor,
    );

    await page.getByRole('button', { name: 'Flat', exact: true }).hover();
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    const hoverShadow = getComputedStyle(flat).boxShadow;
    const flatLayer = flat.querySelector<HTMLElement>(
      '.mat-mdc-button-persistent-ripple',
    );
    const fabLayer = fab.querySelector<HTMLElement>(
      '.mat-mdc-button-persistent-ripple',
    );
    if (!flatLayer || !fabLayer) throw new Error('Expected state layers');
    const flatHover = getComputedStyle(flatLayer, '::before');
    const hoverColor = flatHover.backgroundColor;
    const hoverOpacity = flatHover.opacity;
    await page.getByRole('button', { name: 'FAB', exact: true }).hover();
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    expect(getComputedStyle(fab).boxShadow).toBe(hoverShadow);
    const fabHover = getComputedStyle(fabLayer, '::before');
    expect(fabHover.backgroundColor).toBe(hoverColor);
    expect(fabHover.opacity).toBe(hoverOpacity);
    expect(hoverOpacity).not.toBe('0');

    flat.focus();
    fab.focus();
    expect(
      getComputedStyle(flat).getPropertyValue(
        '--mat-button-filled-focus-state-layer-opacity',
      ),
    ).toBe(
      getComputedStyle(fab).getPropertyValue(
        '--mat-fab-small-focus-state-layer-opacity',
      ),
    );
    expect(
      getComputedStyle(flat).getPropertyValue(
        '--mat-button-filled-pressed-state-layer-opacity',
      ),
    ).toBe(
      getComputedStyle(fab).getPropertyValue(
        '--mat-fab-small-pressed-state-layer-opacity',
      ),
    );
    fixture.destroy();
  });
});
