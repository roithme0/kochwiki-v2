import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type {} from '@vitest/browser-playwright';
import { cdp, page, userEvent } from 'vitest/browser';
import { TextRevealComponent } from './text-reveal.component';

describe('TextRevealComponent browser reveal', () => {
  const text = 'Schön,\ndass du da bist.';
  let fixture: ComponentFixture<TextRevealComponent>;
  let host: HTMLElement;
  let viewport: { width: number; height: number };

  beforeEach(async () => {
    viewport = { width: innerWidth, height: innerHeight };
    await page.viewport(1280, 800);
    fixture = TestBed.createComponent(TextRevealComponent);
    host = fixture.nativeElement as HTMLElement;
    host.style.cssText =
      'display: block; width: 600px; font: 800 44px/1.1 sans-serif;';
    fixture.componentRef.setInput('text', text);
    fixture.componentRef.setInput('startDelay', 250);
    fixture.detectChanges();
  });

  async function waitForReveal(): Promise<void> {
    await Promise.all(
      host
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  }

  afterEach(async () => {
    getSelection()?.removeAllRanges();
    fixture.destroy();
    await page.viewport(viewport.width, viewport.height);
  });

  function hiddenCharacters(): { index: number; text: string | null }[] {
    return Array.from(host.querySelectorAll('.character')).flatMap(
      (character, index) =>
        getComputedStyle(character).opacity === '1'
          ? []
          : [{ index, text: character.textContent }],
    );
  }

  it('shows every character once the staggered reveal has finished', async () => {
    await waitForReveal();
    expect(host.querySelector('[aria-hidden="true"]')?.textContent).toBe(text);
    expect(hiddenCharacters()).toEqual([]);
  });

  it('keeps every character visible during and after native text selection', async () => {
    await waitForReveal();
    const characters = host.querySelectorAll<HTMLElement>('.character');
    const first = characters[0];
    const last = characters[characters.length - 1];
    await userEvent.dragAndDrop(first, last, {
      sourcePosition: { x: 0, y: first.offsetHeight / 2 },
      targetPosition: {
        x: last.getBoundingClientRect().width,
        y: last.offsetHeight / 2,
      },
    });

    expect(getSelection()?.toString()).toBe(text);
    expect.soft(hiddenCharacters()).toEqual([]);
    getSelection()?.removeAllRanges();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    expect(hiddenCharacters()).toEqual([]);
  });

  it('hides characters during the start delay and reveals them in order', () => {
    fixture.componentRef.setInput('text', 'ABC');
    fixture.detectChanges();
    const animations = host.getAnimations({ subtree: true });
    const characters = host.querySelectorAll('.character');
    const opacities = (): string[] =>
      Array.from(
        characters,
        (character) => getComputedStyle(character).opacity,
      );

    for (const [time, expected] of [
      [0, ['0', '0', '0']],
      [252, ['1', '0', '0']],
      [292, ['1', '1', '0']],
      [332, ['1', '1', '1']],
    ] as const) {
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = time;
      }
      expect(opacities()).toEqual(expected);
    }
  });

  it('shows all characters immediately when animation is disabled', () => {
    fixture.componentRef.setInput('startDelay', 10_000);
    fixture.componentRef.setInput('animate', false);
    fixture.detectChanges();
    expect(hiddenCharacters()).toEqual([]);
  });

  it('shows all characters immediately when reduced motion is preferred', async () => {
    const session = cdp();
    try {
      await session.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      fixture.componentRef.setInput('startDelay', 10_000);
      fixture.detectChanges();
      expect(hiddenCharacters()).toEqual([]);
    } finally {
      await session.send('Emulation.setEmulatedMedia', { features: [] });
    }
  });
});
